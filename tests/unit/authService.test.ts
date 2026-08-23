import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (hoisted by vitest above the imports below) ---------------
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    organization: { create: vi.fn() },
    orgMember: { create: vi.fn(), findFirst: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/utils/password', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

vi.mock('../../src/utils/jwt', () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

// hashToken is left real (pure SHA-256, no need to mock or verify it here —
// it's covered implicitly and it's deterministic/fast).

import { prisma } from '../../src/lib/prisma';
import { hashPassword, comparePassword } from '../../src/utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../src/utils/jwt';
import * as authService from '../../src/services/authService';
import { AppError } from '../../src/middleware/errorHandler';

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  organization: { create: ReturnType<typeof vi.fn> };
  orgMember: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  (signAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('mock-access-token');
  (signRefreshToken as ReturnType<typeof vi.fn>).mockReturnValue('mock-refresh-token');
  mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
});

describe('register', () => {
  it('throws EMAIL_TAKEN (409) when the email is already registered', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      authService.register('taken@example.com', 'password123', 'Name', 'Org')
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' });

    // Must short-circuit BEFORE hashing or opening a transaction.
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates user + organization + org_admin membership in a single transaction, then issues tokens', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    (hashPassword as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');

    const createdUser = { id: 'user-1', email: 'new@example.com' };
    const createdOrg = { id: 'org-1', name: 'Acme' };

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue(createdUser) },
        organization: { create: vi.fn().mockResolvedValue(createdOrg) },
        orgMember: { create: vi.fn().mockResolvedValue({ id: 'om-1', role: 'org_admin' }) },
      };
      return cb(tx);
    });

    const result = await authService.register('new@example.com', 'password123', 'New User', 'Acme');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(signAccessToken).toHaveBeenCalledWith({ userId: 'user-1', orgId: 'org-1', role: 'org_admin' });
    expect(signRefreshToken).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
  });

  it('the new registrant always becomes org_admin of their new org (per stated assumption)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    (hashPassword as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');

    let capturedMembershipRole: string | undefined;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue({ id: 'user-1' }) },
        organization: { create: vi.fn().mockResolvedValue({ id: 'org-1' }) },
        orgMember: {
          create: vi.fn().mockImplementation(({ data }: any) => {
            capturedMembershipRole = data.role;
            return { id: 'om-1', ...data };
          }),
        },
      };
      return cb(tx);
    });

    await authService.register('a@example.com', 'password123', 'A', 'OrgA');
    expect(capturedMembershipRole).toBe('org_admin');
  });
});

describe('login', () => {
  it('throws INVALID_CREDENTIALS (401) when the email does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(authService.login('nobody@example.com', 'password')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
    // Must never reveal whether it was the email or password that was wrong.
    expect(comparePassword).not.toHaveBeenCalled();
  });

  it('throws INVALID_CREDENTIALS (401) when the password is wrong — same error as unknown email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: 'hashed' });
    (comparePassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(authService.login('user@example.com', 'wrong-password')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws NO_ORG_MEMBERSHIP (403) if the user has no org membership', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: 'hashed' });
    (comparePassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockPrisma.orgMember.findFirst.mockResolvedValue(null);

    await expect(authService.login('user@example.com', 'correct-password')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_ORG_MEMBERSHIP',
    });
  });

  it('issues tokens scoped to the membership found (oldest membership, per stated assumption)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: 'hashed' });
    (comparePassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockPrisma.orgMember.findFirst.mockResolvedValue({ orgId: 'org-1', role: 'member' });

    const result = await authService.login('user@example.com', 'correct-password');

    expect(mockPrisma.orgMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, orderBy: { createdAt: 'asc' } })
    );
    expect(signAccessToken).toHaveBeenCalledWith({ userId: 'user-1', orgId: 'org-1', role: 'member' });
    expect(result).toEqual({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
  });
});

describe('refresh', () => {
  it('throws INVALID_REFRESH_TOKEN (401) when the JWT itself fails to verify', async () => {
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    await expect(authService.refresh('garbage-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN (401) when no matching non-revoked row exists in the DB', async () => {
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockReturnValue({ userId: 'user-1' });
    mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

    await expect(authService.refresh('valid-jwt-but-revoked')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN (401) when the stored token row is expired', async () => {
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockReturnValue({ userId: 'user-1' });
    mockPrisma.refreshToken.findFirst.mockResolvedValue({
      id: 'rt-1',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(authService.refresh('expired')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rotates the token: revokes the used row, then issues a brand new pair', async () => {
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockReturnValue({ userId: 'user-1' });
    mockPrisma.refreshToken.findFirst.mockResolvedValue({
      id: 'rt-1',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    mockPrisma.refreshToken.update.mockResolvedValue({ id: 'rt-1', revokedAt: new Date() });
    mockPrisma.orgMember.findFirst.mockResolvedValue({ orgId: 'org-1', role: 'member' });

    const result = await authService.refresh('valid-token');

    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
  });
});

describe('logout', () => {
  it('revokes the matching non-revoked refresh token row', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await authService.logout('some-refresh-token');

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
        data: { revokedAt: expect.any(Date) },
      })
    );
  });

  it('is idempotent — does not throw even if no matching row exists', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(authService.logout('already-revoked-or-unknown')).resolves.toBeUndefined();
  });
});

describe('logoutAll', () => {
  it('revokes every active refresh token for the given user, not just one', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await authService.logoutAll('user-1');

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});