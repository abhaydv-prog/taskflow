import * as repo from '../repositories/taskRepository';
import { getProject } from './projectService';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { TaskFilters } from '../repositories/taskRepository';

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
  await getTaskOrThrow(orgId, taskId);

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

  return repo.createAssignment(taskId, userId);
}

export async function unassignTask(orgId: string, taskId: string, userId: string) {
  await getTaskOrThrow(orgId, taskId);
  const existing = await repo.findAssignment(taskId, userId);
  if (!existing) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'This user is not assigned to the task');
  }
  return repo.deleteAssignment(taskId, userId);
}