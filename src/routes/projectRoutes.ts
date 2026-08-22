import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';
import * as ctrl from '../controllers/projectController';
import taskRouter from './taskRoutes';

const router = Router();

router.use(authenticate); // every project route requires a valid access token

router.get('/', asyncHandler(ctrl.listProjectsHandler));
router.post('/', asyncHandler(ctrl.createProjectHandler));
router.get('/:id', asyncHandler(ctrl.getProjectHandler));
router.patch('/:id', asyncHandler(ctrl.updateProjectHandler));
// Assignment spec: "Admins can manage members and delete projects"
router.delete('/:id', requireRole('org_admin'), asyncHandler(ctrl.deleteProjectHandler));
router.get('/:id/dashboard', asyncHandler(ctrl.getDashboardHandler));

// Nested task routes: /projects/:projectId/tasks
router.use('/:projectId/tasks', taskRouter);

export default router;