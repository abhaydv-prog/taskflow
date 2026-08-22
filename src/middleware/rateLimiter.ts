import rateLimit from 'express-rate-limit';

// Assignment requirement: auth endpoints rate-limited to 10 req/min/IP.
// Using in-memory store here (default) is fine for a single-instance
// deployment; if this API ever runs multiple instances behind a load
// balancer, swap to a Redis-backed store (rate-limit-redis, already a
// dependency) so limits are shared across instances.
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
    details: {},
  },
});