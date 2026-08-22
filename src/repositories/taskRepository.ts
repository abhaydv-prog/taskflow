import { prisma } from '../lib/prisma';
import { TaskStatus, TaskPriority, Prisma } from '@prisma/client';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

// Builds the shared WHERE clause for task filtering. Kept separate so
// list and count queries never drift out of sync with each other.
function buildTaskWhere(projectId: string, filters: TaskFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { projectId, deletedAt: null };

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assigneeId) {
    where.assignments = { some: { userId: filters.assigneeId } };
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {
      ...(filters.dueDateFrom && { gte: filters.dueDateFrom }),
      ...(filters.dueDateTo && { lte: filters.dueDateTo }),
    };
  }

  return where;
}

export function findTasksByProject(projectId: string, filters: TaskFilters, skip: number, take: number) {
  const where = buildTaskWhere(projectId, filters);
  return prisma.$transaction([
    prisma.task.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { assignments: { include: { user: { select: { id: true, name: true, email: true } } } } },
    }),
    prisma.task.count({ where }),
  ]);
}

export function findTaskById(id: string) {
  return prisma.task.findFirst({
    where: { id, deletedAt: null },
    include: { assignments: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
}

export function createTask(
  projectId: string,
  data: { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; dueDate?: Date }
) {
  return prisma.task.create({ data: { projectId, ...data } });
}

export function updateTask(
  id: string,
  data: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; dueDate?: Date }
) {
  return prisma.task.update({ where: { id }, data });
}

export function softDeleteTask(id: string) {
  return prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function findAssignment(taskId: string, userId: string) {
  return prisma.taskAssignment.findUnique({ where: { taskId_userId: { taskId, userId } } });
}

export function createAssignment(taskId: string, userId: string) {
  return prisma.taskAssignment.create({ data: { taskId, userId } });
}

export function deleteAssignment(taskId: string, userId: string) {
  return prisma.taskAssignment.delete({ where: { taskId_userId: { taskId, userId } } });
}