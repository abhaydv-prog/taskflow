import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { cleanDatabase, disconnectDatabase } from '../setup/testDb';

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('POST /auth/register', () => {
  it('creates a user + org and returns an access/refresh token pair', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
      organizationName: 'Alice Inc',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await request(app).post('/auth/register').send({
      email: 'dup@example.com',
      password: 'password123',
      name: 'First',
      organizationName: 'Org1',
    });

    const res = await request(app).post('/auth/register').send({
      email: 'dup@example.com',
      password: 'password123',
      name: 'Second',
      organizationName: 'Org2',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a password shorter than 8 characters with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'short@example.com',
      password: 'short',
      name: 'Short',
      organizationName: 'Org',
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('POST /auth/login', () => {
  const email = 'bob@example.com';
  const password = 'password123';

  beforeEach(async () => {
    await request(app).post('/auth/register').send({ email, password, name: 'Bob', organizationName: 'Bob Co' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody@example.com', password });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a wrong password with the SAME 401 INVALID_CREDENTIALS (no user-enumeration leak)', async () => {
    const res = await request(app).post('/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /auth/refresh', () => {
  it('issues a new token pair and rotates (revokes) the old refresh token', async () => {
    const registerRes = await request(app).post('/auth/register').send({
      email: 'carol@example.com',
      password: 'password123',
      name: 'Carol',
      organizationName: 'Carol LLC',
    });
    const oldRefreshToken = registerRes.body.refreshToken;

    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(refreshRes.body.refreshToken).not.toBe(oldRefreshToken);

    // The old token must now be dead (rotation) — reusing it should fail.
    const reuseRes = await request(app).post('/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a garbage/malformed refresh token with 401', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'not-a-real-jwt' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token so it can no longer be used to refresh', async () => {
    const registerRes = await request(app).post('/auth/register').send({
      email: 'dave@example.com',
      password: 'password123',
      name: 'Dave',
      organizationName: 'Dave Co',
    });
    const refreshToken = registerRes.body.refreshToken;

    const logoutRes = await request(app).post('/auth/logout').send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('is idempotent — logging out an already-revoked token still returns 200', async () => {
    const registerRes = await request(app).post('/auth/register').send({
      email: 'erin@example.com',
      password: 'password123',
      name: 'Erin',
      organizationName: 'Erin Co',
    });
    const refreshToken = registerRes.body.refreshToken;

    await request(app).post('/auth/logout').send({ refreshToken });
    const secondLogout = await request(app).post('/auth/logout').send({ refreshToken });
    expect(secondLogout.status).toBe(200);
  });
});