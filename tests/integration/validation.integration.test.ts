import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { cleanDatabase, disconnectDatabase } from '../setup/testDb';
import { registerUser, authHeader, AuthedUser } from './helpers';

let user: AuthedUser;

beforeEach(async () => {
  await cleanDatabase();
  user = await registerUser('validator@example.com', 'password123', 'Validator', 'Validation Org');
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('Consistent error shape', () => {
  it('every error response matches { error, code, details }', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: expect.any(String),
      code: 'VALIDATION_ERROR',
      details: expect.any(Object),
    });
  });
});

describe('Auth validation', () => {
  it('rejects registration with an invalid email format', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'not-an-email',
      password: 'password123',
      name: 'X',
      organizationName: 'Org',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects registration with a missing organizationName', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'ok@example.com',
      password: 'password123',
      name: 'X',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects login with an empty password', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'ok@example.com', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects refresh with a missing refreshToken', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Authentication middleware', () => {
  it('rejects a protected route with no Authorization header (401)', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed Authorization header (no Bearer prefix)', async () => {
    const res = await request(app).get('/projects').set('Authorization', user.accessToken);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid/garbage access token', async () => {
    const res = await request(app).get('/projects').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

describe('Project/task validation', () => {
  it('rejects creating a project with an empty name', async () => {
    const res = await request(app).post('/projects').set(authHeader(user)).send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating a task with an invalid status enum value', async () => {
    const project = await request(app).post('/projects').set(authHeader(user)).send({ name: 'P' });
    const res = await request(app)
      .post(`/projects/${project.body.id}/tasks`)
      .set(authHeader(user))
      .send({ title: 'T', status: 'not-a-real-status' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating a task with an empty title', async () => {
    const project = await request(app).post('/projects').set(authHeader(user)).send({ name: 'P' });
    const res = await request(app).post(`/projects/${project.body.id}/tasks`).set(authHeader(user)).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects filtering tasks by a non-UUID assignee', async () => {
    const project = await request(app).post('/projects').set(authHeader(user)).send({ name: 'P' });
    const res = await request(app)
      .get(`/projects/${project.body.id}/tasks?assignee=not-a-uuid`)
      .set(authHeader(user));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects assigning with a non-UUID userId', async () => {
    const project = await request(app).post('/projects').set(authHeader(user)).send({ name: 'P' });
    const task = await request(app).post(`/projects/${project.body.id}/tasks`).set(authHeader(user)).send({ title: 'T' });
    const res = await request(app)
      .post(`/tasks/${task.body.id}/assignments`)
      .set(authHeader(user))
      .send({ userId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 TASK_NOT_FOUND for a well-formed but nonexistent task id', async () => {
    const res = await request(app)
      .get('/tasks/00000000-0000-0000-0000-000000000000')
      .set(authHeader(user));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TASK_NOT_FOUND');
  });
});