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
  // Integration tests exercise /auth/* dozens of times per run — without
  // this, the shared in-memory store (one instance for the app's lifetime)
  // would trip 429s partway through the suite. Real (non-test) traffic is
  // completely unaffected; this only short-circuits when NODE_ENV=test.
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
    details: {},
  },
});