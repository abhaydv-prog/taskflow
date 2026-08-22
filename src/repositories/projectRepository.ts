import { prisma } from '../lib/prisma';

// Repository layer: pure data access. No org-scoping decisions happen
// here — every function requires orgId as an explicit parameter, and
// callers (services) are responsible for passing the AUTHENTICATED
// user's orgId, never a client-supplied one.

export function findProjectsByOrg(orgId: string, skip: number, take: number) {
  return prisma.$transaction([
    prisma.project.findMany({
      where: { orgId, deletedAt: null },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.count({ where: { orgId, deletedAt: null } }),
  ]);
}

export function findProjectById(id: string) {
  return prisma.project.findFirst({ where: { id, deletedAt: null } });
}

export function createProject(orgId: string, name: string, description?: string) {
  return prisma.project.create({ data: { orgId, name, description } });
}

export function updateProject(id: string, data: { name?: string; description?: string }) {
  return prisma.project.update({ where: { id }, data });
}

// Soft delete — sets deletedAt instead of removing the row (bonus requirement).
export function softDeleteProject(id: string) {
  return prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
}

// Dashboard: task counts grouped by status for one project.
export function countTasksByStatus(projectId: string) {
  return prisma.task.groupBy({
    by: ['status'],
    where: { projectId, deletedAt: null },
    _count: { _all: true },
  });
}