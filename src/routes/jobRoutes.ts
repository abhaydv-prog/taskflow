import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getJobHandler } from '../controllers/jobController';

const router = Router();

router.use(authenticate);
router.get('/:id', asyncHandler(getJobHandler));

export default router;