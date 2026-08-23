import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { cleanDatabase, disconnectDatabase } from '../setup/testDb';
import { registerUser, addMemberToOrg, authHeader, AuthedUser } from './helpers';

let admin: AuthedUser;

beforeEach(async () => {
  await cleanDatabase();
  admin = await registerUser('admin@example.com', 'password123', 'Admin', 'TaskFlow Org');
});

afterAll(async () => {
  await disconnectDatabase();
});

async function createProject(name = 'Project A') {
  const res = await request(app).post('/projects').set(authHeader(admin)).send({ name });
  return res.body;
}

describe('Project CRUD', () => {
  it('creates, lists, gets, updates, and deletes a project', async () => {
    const create = await request(app).post('/projects').set(authHeader(admin)).send({ name: 'My Project', description: 'desc' });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: 'My Project', description: 'desc', orgId: admin.orgId });

    const list = await request(app).get('/projects').set(authHeader(admin));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(list.body.data).toHaveLength(1);

    const get = await request(app).get(`/projects/${create.body.id}`).set(authHeader(admin));
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(create.body.id);

    const update = await request(app).patch(`/projects/${create.body.id}`).set(authHeader(admin)).send({ name: 'Renamed' });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe('Renamed');

    const del = await request(app).delete(`/projects/${create.body.id}`).set(authHeader(admin));
    expect(del.status).toBe(204);
  });

  it('only org_admin can delete a project — a member gets 403', async () => {
    const project = await createProject();
    const member = await addMemberToOrg(admin.orgId, 'member1@example.com', 'password123', 'Member One', 'member');

    const res = await request(app).delete(`/projects/${project.id}`).set(authHeader(member));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

describe('Task CRUD + filters + pagination', () => {
  it('creates a task under a project and returns 201', async () => {
    const project = await createProject();
    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(authHeader(admin))
      .send({ title: 'Write tests', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo' });
  });

  it('lists tasks with the exact offset-pagination shape from the spec', async () => {
    const project = await createProject();
    for (let i = 0; i < 3; i++) {
      await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: `Task ${i}` });
    }

    const res = await request(app).get(`/projects/${project.id}/tasks`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: expect.any(Array),
      total: 3,
      page: 1,
      limit: 20,
    });
    expect(res.body.data).toHaveLength(3);
  });

  it('filters tasks by status', async () => {
    const project = await createProject();
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Todo task', status: 'todo' });
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Done task', status: 'done' });

    const res = await request(app).get(`/projects/${project.id}/tasks?status=done`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Done task');
  });

  it('filters tasks by priority', async () => {
    const project = await createProject();
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Low', priority: 'low' });
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Urgent', priority: 'urgent' });

    const res = await request(app).get(`/projects/${project.id}/tasks?priority=urgent`).set(authHeader(admin));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Urgent');
  });

  it('updates and soft-deletes a task', async () => {
    const project = await createProject();
    const created = await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Original' });

    const updated = await request(app).patch(`/tasks/${created.body.id}`).set(authHeader(admin)).send({ status: 'in_progress' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('in_progress');

    const deleted = await request(app).delete(`/tasks/${created.body.id}`).set(authHeader(admin));
    expect(deleted.status).toBe(204);

    // Soft-deleted tasks should no longer show up in the list.
    const list = await request(app).get(`/projects/${project.id}/tasks`).set(authHeader(admin));
    expect(list.body.total).toBe(0);
  });
});

describe('Task assignment', () => {
  it('assigns a same-org user to a task, then unassigns them', async () => {
    const project = await createProject();
    const task = await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Assign me' });
    const member = await addMemberToOrg(admin.orgId, 'assignee@example.com', 'password123', 'Assignee', 'member');

    const assign = await request(app)
      .post(`/tasks/${task.body.id}/assignments`)
      .set(authHeader(admin))
      .send({ userId: member.userId });
    expect(assign.status).toBe(201);

    const unassign = await request(app)
      .delete(`/tasks/${task.body.id}/assignments/${member.userId}`)
      .set(authHeader(admin));
    expect(unassign.status).toBe(204);
  });

  it('rejects assigning a user who does not belong to the same org (400)', async () => {
    const project = await createProject();
    const task = await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Assign me' });
    const outsider = await registerUser('outsider@example.com', 'password123', 'Outsider', 'Other Org');

    const res = await request(app)
      .post(`/tasks/${task.body.id}/assignments`)
      .set(authHeader(admin))
      .send({ userId: outsider.userId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_NOT_IN_ORG');
  });

  it('rejects assigning the same user twice (409)', async () => {
    const project = await createProject();
    const task = await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'Assign me' });
    const member = await addMemberToOrg(admin.orgId, 'twice@example.com', 'password123', 'Twice', 'member');

    await request(app).post(`/tasks/${task.body.id}/assignments`).set(authHeader(admin)).send({ userId: member.userId });
    const second = await request(app)
      .post(`/tasks/${task.body.id}/assignments`)
      .set(authHeader(admin))
      .send({ userId: member.userId });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ALREADY_ASSIGNED');
  });

  it('filters tasks by assignee', async () => {
    const project = await createProject();
    const member = await addMemberToOrg(admin.orgId, 'filterme@example.com', 'password123', 'FilterMe', 'member');
    const taskA = await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'A' });
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'B' });
    await request(app).post(`/tasks/${taskA.body.id}/assignments`).set(authHeader(admin)).send({ userId: member.userId });

    const res = await request(app)
      .get(`/projects/${project.id}/tasks?assignee=${member.userId}`)
      .set(authHeader(admin));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(taskA.body.id);
  });
});

describe('Project dashboard', () => {
  it('returns task counts grouped by status, including zero-count statuses', async () => {
    const project = await createProject();
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'A', status: 'todo' });
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'B', status: 'todo' });
    await request(app).post(`/projects/${project.id}/tasks`).set(authHeader(admin)).send({ title: 'C', status: 'done' });

    const res = await request(app).get(`/projects/${project.id}/dashboard`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 2, in_progress: 0, review: 0, done: 1 });
  });
});