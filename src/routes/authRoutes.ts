import { Router } from 'express';
import { authRateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { registerHandler, loginHandler, refreshHandler, logoutHandler } from '../controllers/authController';

const router = Router();

// All auth endpoints share the 10 req/min/IP rate limit per assignment spec.
router.post('/register', authRateLimiter, asyncHandler(registerHandler));
router.post('/login', authRateLimiter, asyncHandler(loginHandler));
router.post('/refresh', authRateLimiter, asyncHandler(refreshHandler));
router.post('/logout', authRateLimiter, asyncHandler(logoutHandler));

export default router;