import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt';
import { AppError } from './errorHandler';

// Augment Express Request with auth context.
declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

// Reads the Bearer token, verifies it, and attaches { userId, orgId, role }
// to req.auth. Every downstream service call uses req.auth.orgId —
// NEVER a client-supplied org_id from body/query/params. This is the
// single enforcement point that makes cross-tenant isolation possible.
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length);

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
  }
}