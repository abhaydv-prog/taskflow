import * as repo from '../repositories/taskRepository';
import { getProject } from './projectService';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { TaskFilters } from '../repositories/taskRepository';
import { enqueueAssignmentEmail } from '../jobs/emailQueue';

// Guards the enqueue call so a slow/unreachable Redis can never hang the
// HTTP response — matches the documented design ("assignment always
// succeeds, notification is best-effort"), which the plain await
// previously didn't actually enforce.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Operation timed out')), ms)),
  ]);
}

// Every function re-verifies the parent project belongs to the caller's
// org before touching any task, so a guessed task ID from another org
// still can't be accessed.

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
  await getProject(orgId, projectId);
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

  // Consistency strategy: the assignment is persisted first and is the
  // source of truth. If enqueueing the email fails, we log it and do
  // NOT roll back the assignment — the user is already validly assigned.
  // A stricter version would use a transactional outbox table to
  // guarantee zero notification loss; skipped here for time.
  try {
    const assignee = await prisma.user.findUnique({ where: { id: userId } });
    if (assignee) {
      await withTimeout(
        enqueueAssignmentEmail({
          taskId: task.id,
          taskTitle: task.title,
          assigneeUserId: userId,
          assigneeEmail: assignee.email,
        }),
        3000
      );
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