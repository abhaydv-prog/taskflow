import { prisma } from '../lib/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { hashToken } from '../utils/hashToken';
import { AppError } from '../middleware/errorHandler';

// ASSUMPTION (stated per guideline #11 — assignment doesn't specify how
// a user first gets into an org): registering creates a brand-new
// organization with the registering user as org_admin. Joining an
// existing org would need an invite flow, which is out of scope here
// unless you tell me otherwise.
export async function register(email: string, password: string, name: string, organizationName: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  // Transaction: user + org + membership must all succeed together,
  // or none of them should persist.
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, name } });
    const organization = await tx.organization.create({ data: { name: organizationName } });
    await tx.orgMember.create({
      data: { userId: user.id, orgId: organization.id, role: 'org_admin' },
    });
    return { user, organization };
  });

  return issueTokens(result.user.id, result.organization.id, 'org_admin');
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // A user may belong to multiple orgs — for login we pick their
  // first/oldest membership as the active context. Switching orgs
  // post-login is out of scope for this assignment.
  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    throw new AppError(403, 'NO_ORG_MEMBERSHIP', 'User does not belong to any organization');
  }

  return issueTokens(user.id, membership.orgId, membership.role);
}

export async function refresh(refreshToken: string) {
  let payload: { userId: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findFirst({
    where: { userId: payload.userId, tokenHash, revokedAt: null },
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid, expired, or revoked');
  }

  // Bonus: refresh token rotation — revoke the used token, issue a new one.
  // Prevents a leaked refresh token from being replayed indefinitely.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: payload.userId },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    throw new AppError(403, 'NO_ORG_MEMBERSHIP', 'User does not belong to any organization');
  }

  return issueTokens(payload.userId, membership.orgId, membership.role);
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  // Idempotent: if the token doesn't exist or is already revoked, that's fine —
  // the end state (no valid session for this token) is what we want either way.
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Bonus: logout from all devices — revoke every active refresh token for the user.
export async function logoutAll(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(userId: string, orgId: string, role: 'org_admin' | 'member') {
  const accessToken = signAccessToken({ userId, orgId, role });
  const refreshToken = signRefreshToken(userId);

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    },
  });

  return { accessToken, refreshToken };
}
