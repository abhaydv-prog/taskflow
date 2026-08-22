import crypto from 'crypto';

// Refresh tokens are high-entropy random JWTs (unlike user passwords),
// so a fast SHA-256 digest is appropriate here — bcrypt's deliberate
// slowness is unnecessary and would also make revocation lookups slow.
// We still never store the raw token, only this hash.
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}