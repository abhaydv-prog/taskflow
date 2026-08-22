import * as repo from '../repositories/projectRepository';
import { AppError } from '../middleware/errorHandler';

// EVERY function here takes `orgId` from req.auth (set by authenticate
// middleware from the verified JWT) — never from req.params/body/query.
// This is the single place cross-tenant access is prevented for projects.

export async function listProjects(orgId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [data, total] = await repo.findProjectsByOrg(orgId, skip, limit);
  return { data, total };
}

export async function getProject(orgId: string, projectId: string) {
  const project = await repo.findProjectById(projectId);
  // 404 (not 403) when the project doesn't exist at all — but 403 when
  // it exists and belongs to a DIFFERENT org. Per assignment spec:
  // cross-tenant attempts must return 403 and must NOT leak resource data.
  if (!project) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
  }
  if (project.orgId !== orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this project');
  }
  return project;
}

export async function createProject(orgId: string, name: string, description?: string) {
  return repo.createProject(orgId, name, description);
}

export async function updateProject(
  orgId: string,
  projectId: string,
  data: { name?: string; description?: string }
) {
  await getProject(orgId, projectId); // throws 404/403 as appropriate
  return repo.updateProject(projectId, data);
}

// Assignment spec: "Admins can manage members and delete projects" —
// role check happens in the route (requireRole middleware); this
// function still re-verifies org ownership regardless of role.
export async function deleteProject(orgId: string, projectId: string) {
  await getProject(orgId, projectId);
  return repo.softDeleteProject(projectId);
}

export async function getDashboard(orgId: string, projectId: string) {
  await getProject(orgId, projectId);
  const counts = await repo.countTasksByStatus(projectId);

  // Normalize into a flat { todo: n, in_progress: n, review: n, done: n } shape —
  // groupBy only returns statuses that have at least one task, so we
  // fill in zeros for the rest to make the response predictable for clients.
  const result: Record<string, number> = { todo: 0, in_progress: 0, review: 0, done: 0 };
  for (const row of counts) {
    result[row.status] = row._count._all;
  }
  return result;
}