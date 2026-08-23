import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../src/utils/jwt';

describe('access tokens', () => {
  const payload = { userId: 'user-1', orgId: 'org-1', role: 'member' as const };

  it('signs a token that verifyAccessToken can decode back to the same payload', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.orgId).toBe(payload.orgId);
    expect(decoded.role).toBe(payload.role);
  });

  it('includes a unique jti (jwt id) so two tokens for the same payload differ', () => {
    const tokenA = signAccessToken(payload);
    const tokenB = signAccessToken(payload);
    expect(tokenA).not.toBe(tokenB);
  });

  it('sets a 15 minute expiry, per assignment spec', () => {
    const token = signAccessToken(payload);
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    const ttlSeconds = decoded.exp - decoded.iat;
    expect(ttlSeconds).toBe(15 * 60);
  });

  it('throws when verifying a token signed with a different secret', () => {
    const forged = jwt.sign(payload, 'wrong-secret', { expiresIn: '15m' });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('throws when verifying a malformed token', () => {
    expect(() => verifyAccessToken('not-a-real-token')).toThrow();
  });

  it('throws when verifying an already-expired token', () => {
    const expired = jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, { expiresIn: '-1s' });
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

describe('refresh tokens', () => {
  it('signs a token that verifyRefreshToken can decode back to the same userId', () => {
    const token = signRefreshToken('user-42');
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe('user-42');
  });

  it('sets a 7 day expiry, per assignment spec', () => {
    const token = signRefreshToken('user-42');
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    const ttlSeconds = decoded.exp - decoded.iat;
    expect(ttlSeconds).toBe(7 * 24 * 60 * 60);
  });

  it('uses a different secret than access tokens (access secret cannot verify a refresh token)', () => {
    const refreshToken = signRefreshToken('user-42');
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  it('throws when verifying a malformed refresh token', () => {
    expect(() => verifyRefreshToken('garbage')).toThrow();
  });
});