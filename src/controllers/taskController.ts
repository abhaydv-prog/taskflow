import { Request, Response } from 'express';
import * as taskService from '../services/taskService';
import { createTaskSchema, updateTaskSchema, taskFilterSchema, assignTaskSchema } from '../validators/taskValidators';
import { parsePagination, paginatedResponse } from '../utils/pagination';
import { AppError } from '../middleware/errorHandler';

export async function listTasksHandler(req: Request, res: Response) {
  const parsed = taskFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid filter parameters', { issues: parsed.error.issues });
  }
  const { page, limit } = parsePagination(req.query);
  const filters = {
    status: parsed.data.status,
    priority: parsed.data.priority,
    assigneeId: parsed.data.assignee,
    dueDateFrom: parsed.data.dueDateFrom,
    dueDateTo: parsed.data.dueDateTo,
  };
  const { data, total } = await taskService.listTasks(req.auth!.orgId, req.params.projectId, filters, page, limit);
  res.json(paginatedResponse(data, total, page, limit));
}

export async function getTaskHandler(req: Request, res: Response) {
  const task = await taskService.getTask(req.auth!.orgId, req.params.id);
  res.json(task);
}

export async function createTaskHandler(req: Request, res: Response) {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid task data', { issues: parsed.error.issues });
  }
  const task = await taskService.createTask(req.auth!.orgId, req.params.projectId, parsed.data);
  res.status(201).json(task);
}

export async function updateTaskHandler(req: Request, res: Response) {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid task data', { issues: parsed.error.issues });
  }
  const task = await taskService.updateTask(req.auth!.orgId, req.params.id, parsed.data);
  res.json(task);
}

export async function deleteTaskHandler(req: Request, res: Response) {
  await taskService.deleteTask(req.auth!.orgId, req.params.id);
  res.status(204).send();
}

export async function assignTaskHandler(req: Request, res: Response) {
  const parsed = assignTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid assignment data', { issues: parsed.error.issues });
  }
  const assignment = await taskService.assignTask(req.auth!.orgId, req.params.id, parsed.data.userId);
  res.status(201).json(assignment);
}

export async function unassignTaskHandler(req: Request, res: Response) {
  await taskService.unassignTask(req.auth!.orgId, req.params.id, req.params.userId);
  res.status(204).send();
}