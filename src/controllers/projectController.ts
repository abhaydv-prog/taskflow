import { Request, Response } from 'express';
import * as projectService from '../services/projectService';
import { createProjectSchema, updateProjectSchema } from '../validators/projectValidators';
import { parsePagination, paginatedResponse } from '../utils/pagination';
import { AppError } from '../middleware/errorHandler';

export async function listProjectsHandler(req: Request, res: Response) {
  const { page, limit } = parsePagination(req.query);
  const { data, total } = await projectService.listProjects(req.auth!.orgId, page, limit);
  res.json(paginatedResponse(data, total, page, limit));
}

export async function getProjectHandler(req: Request, res: Response) {
  const project = await projectService.getProject(req.auth!.orgId, req.params.id);
  res.json(project);
}

export async function createProjectHandler(req: Request, res: Response) {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project data', { issues: parsed.error.issues });
  }
  const project = await projectService.createProject(req.auth!.orgId, parsed.data.name, parsed.data.description);
  res.status(201).json(project);
}

export async function updateProjectHandler(req: Request, res: Response) {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project data', { issues: parsed.error.issues });
  }
  const project = await projectService.updateProject(req.auth!.orgId, req.params.id, parsed.data);
  res.json(project);
}

export async function deleteProjectHandler(req: Request, res: Response) {
  await projectService.deleteProject(req.auth!.orgId, req.params.id);
  res.status(204).send();
}

export async function getDashboardHandler(req: Request, res: Response) {
  const counts = await projectService.getDashboard(req.auth!.orgId, req.params.id);
  res.json(counts);
}