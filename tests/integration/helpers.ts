import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { hashPassword } from '../../src/utils/password';

export interface AuthedUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
  orgId: string;
  role: 'org_admin' | 'member';
}

function decodeAccessToken(token: string) {
  return jwt.decode(token) as { userId: string; orgId: string; role: 'org_admin' | 'member' };
}

// Registers a brand-new user via the real API. Per authService's stated
// assumption, this also creates a brand-new organization with this user
// as org_admin — so every call to this makes its OWN isolated org.
export async function registerUser(
  email: string,
  password = 'password123',
  name = 'Test User',
  orgName = 'Test Org'
): Promise<AuthedUser> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password, name, organizationName: orgName });

  if (res.status !== 201) {
    throw new Error(`registerUser setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const claims = decodeAccessToken(res.body.accessToken);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, ...claims };
}

// There is no invite/add-member endpoint in this API yet, so putting a
// SECOND user into an EXISTING org has to go through Prisma directly for
// the seed step — then logs in through the real /auth/login endpoint so
// the actual login code path is still what issues the tokens.
export async function addMemberToOrg(
  orgId: string,
  email: string,
  password = 'password123',
  name = 'Second User',
  role: 'org_admin' | 'member' = 'member'
): Promise<AuthedUser> {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  await prisma.orgMember.create({ data: { userId: user.id, orgId, role } });

  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`addMemberToOrg login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const claims = decodeAccessToken(res.body.accessToken);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, ...claims };
}

export function authHeader(user: AuthedUser) {
  return { Authorization: `Bearer ${user.accessToken}` };
}