import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Payload kept minimal on purpose: userId + orgId + role.
// orgId/role are a SNAPSHOT at login time — every service call still
// re-verifies against org_members before trusting it (see authMiddleware
// + services). This snapshot only avoids an extra DB hit per request
// for the common case; it is never the sole source of authorization truth.
export interface AccessTokenPayload {
  userId: string;
  orgId: string;
  role: 'org_admin' | 'member';
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in .env');
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh token JWT only carries userId — the DB row (RefreshToken table)
// is the actual source of truth for validity/revocation, not the JWT's
// own expiry. This is what makes server-side revocation possible.
export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: crypto.randomUUID() }, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
}