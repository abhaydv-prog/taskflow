import * as repo from '../repositories/taskRepository';
import { getProject } from './projectService';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { TaskFilters } from '../repositories/taskRepository';
import { enqueueAssignmentEmail } from '../jobs/emailQueue';

// Every function re-verifies the parent project belongs to the caller's
// org (via projectService.getProject, which throws 404/403 as needed)
// BEFORE touching any task. This is what makes "every task must belong
// to a project within the authenticated user's organization" hold true
// even if someone guesses a valid task ID from another org.

export async function listTasks(orgId: string, projectId: string, filters: TaskFilters, page: number, limit: number) {
  await getProject(orgId, projectId);
  const skip = (page - 1) * limit;
  const [data, total] = await repo.findTasksByProject(projectId, filters, skip, limit);
  return { data, total };
}

async function getTaskOrThrow(orgId: string, taskId: string) {
  const task = await repo.findTaskById(taskId);
  if (!task) {
    throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
  }
  // Verify the task's project belongs to the caller's org.
  await getProject(orgId, task.projectId);
  return task;
}

export async function getTask(orgId: string, taskId: string) {
  return getTaskOrThrow(orgId, taskId);
}

export async function createTask(
  orgId: string,
  projectId: string,
  data: { title: string; description?: string; status?: any; priority?: any; dueDate?: Date }
) {
  await getProject(orgId, projectId); // ensures project exists in caller's org
  return repo.createTask(projectId, data);
}

export async function updateTask(orgId: string, taskId: string, data: Record<string, unknown>) {
  await getTaskOrThrow(orgId, taskId);
  return repo.updateTask(taskId, data);
}

export async function deleteTask(orgId: string, taskId: string) {
  await getTaskOrThrow(orgId, taskId);
  return repo.softDeleteTask(taskId);
}

export async function assignTask(orgId: string, taskId: string, userId: string) {
  const task = await getTaskOrThrow(orgId, taskId);

  // Assignment spec: "The assigned user must belong to the same organization
  // as the task" — verify via org_members, never assume the client is right.
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership) {
    throw new AppError(400, 'USER_NOT_IN_ORG', 'The user to assign must belong to the same organization');
  }

  const existing = await repo.findAssignment(taskId, userId);
  if (existing) {
    throw new AppError(409, 'ALREADY_ASSIGNED', 'This user is already assigned to the task');
  }

  const assignment = await repo.createAssignment(taskId, userId);

  // CONSISTENCY STRATEGY (per assignment Task 04 requirement):
  // The assignment is persisted FIRST and is the source of truth — it
  // must succeed regardless of what happens to the notification. If
  // enqueueing the email job fails (e.g. Redis is temporarily down),
  // we log the failure here and do NOT roll back or fail this request;
  // the user is already validly assigned to the task.
  //
  // ASSUMPTION (stated per guideline #11): a fully production-grade
  // version of this would use the transactional outbox pattern — write
  // a pending-notification row in the SAME DB transaction as the
  // assignment, then have a separate poller enqueue it — guaranteeing
  // zero notification loss even across a Redis outage. That additional
  // outbox table/poller is out of scope for this assignment's timeline;
  // we accept "assignment always succeeds, notification is best-effort
  // with retry + dead-letter" as the deliberate trade-off here.
  try {
    const assignee = await prisma.user.findUnique({ where: { id: userId } });
    if (assignee) {
      await enqueueAssignmentEmail({
        taskId: task.id,
        taskTitle: task.title,
        assigneeUserId: userId,
        assigneeEmail: assignee.email,
      });
    }
  } catch (err) {
    console.error(`Failed to enqueue assignment email for task ${taskId}:`, err);
  }

  return assignment;
}

export async function unassignTask(orgId: string, taskId: string, userId: string) {
  await getTaskOrThrow(orgId, taskId);
  const existing = await repo.findAssignment(taskId, userId);
  if (!existing) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'This user is not assigned to the task');
  }
  return repo.deleteAssignment(taskId, userId);
}