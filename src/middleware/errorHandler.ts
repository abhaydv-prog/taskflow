import { Request, Response, NextFunction } from 'express';

// Consistent error shape per assignment spec:
// { "error": "...", "code": "...", "details": {} }
export class AppError extends Error {
  statusCode: number;
  code: string;
  details: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  // Unexpected errors — never leak internals (stack traces, DB errors) to the client.
  console.error(err);
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    details: {},
  });
}

// Wraps async route handlers so thrown errors reach errorHandler
// instead of crashing the process (Express 4 doesn't auto-catch async errors).
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}