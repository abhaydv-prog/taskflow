import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as ctrl from '../controllers/taskController';

const router = Router();

router.use(authenticate);

router.get('/:id', asyncHandler(ctrl.getTaskHandler));
router.patch('/:id', asyncHandler(ctrl.updateTaskHandler));
router.delete('/:id', asyncHandler(ctrl.deleteTaskHandler));
router.post('/:id/assignments', asyncHandler(ctrl.assignTaskHandler));
router.delete('/:id/assignments/:userId', asyncHandler(ctrl.unassignTaskHandler));

export default router;