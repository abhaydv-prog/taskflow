import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as ctrl from '../controllers/taskController';

// mergeParams: true — required to read :projectId from the parent
// router (/projects/:projectId/tasks). Auth is already applied by the
// parent projectRoutes router before this is reached.
const router = Router({ mergeParams: true });

router.get('/', asyncHandler(ctrl.listTasksHandler));
router.post('/', asyncHandler(ctrl.createTaskHandler));

export default router;