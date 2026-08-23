import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { cleanDatabase, disconnectDatabase } from '../setup/testDb';
import { registerUser, addMemberToOrg, authHeader, AuthedUser } from './helpers';

let orgAUser: AuthedUser;
let orgBUser: AuthedUser;
let orgAProject: { id: string; name: string };
let orgATask: { id: string; title: string };

beforeEach(async () => {
  await cleanDatabase();

  orgAUser = await registerUser('a-owner@example.com', 'password123', 'Org A Owner', 'Org A');
  orgBUser = await registerUser('b-owner@example.com', 'password123', 'Org B Owner', 'Org B');

  const projectRes = await request(app)
    .post('/projects')
    .set(authHeader(orgAUser))
    .send({ name: 'Org A Secret Project' });
  orgAProject = projectRes.body;

  const taskRes = await request(app)
    .post(`/projects/${orgAProject.id}/tasks`)
    .set(authHeader(orgAUser))
    .send({ title: 'Org A Secret Task' });
  orgATask = taskRes.body;
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('Cross-tenant access is blocked', () => {
  it('GET /projects/:id — org B cannot read org A\'s project, and gets 403 (not the project data)', async () => {
    const res = await request(app).get(`/projects/${orgAProject.id}`).set(authHeader(orgBUser));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    // Must not leak the project's name or any other field.
    expect(JSON.stringify(res.body)).not.toContain('Org A Secret Project');
    expect(res.body.name).toBeUndefined();
  });

  it('PATCH /projects/:id — org B cannot modify org A\'s project', async () => {
    const res = await request(app)
      .patch(`/projects/${orgAProject.id}`)
      .set(authHeader(orgBUser))
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('DELETE /projects/:id — org B (even as their own org_admin) cannot delete org A\'s project', async () => {
    const res = await request(app).delete(`/projects/${orgAProject.id}`).set(authHeader(orgBUser));
    expect(res.status).toBe(403);
  });

  it('GET /projects/:id/dashboard — org B cannot see org A\'s task counts', async () => {
    const res = await request(app).get(`/projects/${orgAProject.id}/dashboard`).set(authHeader(orgBUser));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('GET /tasks/:id — org B cannot read org A\'s task, and gets 403 (not the task data)', async () => {
    const res = await request(app).get(`/tasks/${orgATask.id}`).set(authHeader(orgBUser));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('Org A Secret Task');
  });

  it('PATCH /tasks/:id — org B cannot modify org A\'s task', async () => {
    const res = await request(app)
      .patch(`/tasks/${orgATask.id}`)
      .set(authHeader(orgBUser))
      .send({ status: 'done' });
    expect(res.status).toBe(403);
  });

  it('DELETE /tasks/:id — org B cannot delete org A\'s task', async () => {
    const res = await request(app).delete(`/tasks/${orgATask.id}`).set(authHeader(orgBUser));
    expect(res.status).toBe(403);
  });

  it('POST /tasks/:id/assignments — org B cannot assign anyone to org A\'s task', async () => {
    const res = await request(app)
      .post(`/tasks/${orgATask.id}/assignments`)
      .set(authHeader(orgBUser))
      .send({ userId: orgBUser.userId });
    expect(res.status).toBe(403);
  });

  it('GET /projects/:projectId/tasks — org B cannot list org A\'s tasks', async () => {
    const res = await request(app).get(`/projects/${orgAProject.id}/tasks`).set(authHeader(orgBUser));
    expect(res.status).toBe(403);
  });

  it('a member within org B still cannot reach org A\'s data (not just the org B admin)', async () => {
    const orgBMember = await addMemberToOrg(orgBUser.orgId, 'b-member@example.com', 'password123', 'Org B Member', 'member');
    const res = await request(app).get(`/projects/${orgAProject.id}`).set(authHeader(orgBMember));
    expect(res.status).toBe(403);
  });

  it('a nonexistent resource still returns 404 (not 403) — distinguishing "not found" from "cross-tenant"', async () => {
    const res = await request(app)
      .get('/projects/00000000-0000-0000-0000-000000000000')
      .set(authHeader(orgAUser));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});