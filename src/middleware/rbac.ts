import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Usage: router.delete('/:id', authenticate, requireRole('org_admin'), handler)
// Must run AFTER `authenticate` — depends on req.auth being set.
export function requireRole(...allowedRoles: Array<'org_admin' | 'member'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    }
    if (!allowedRoles.includes(req.auth.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
    }
    next();
  };
}