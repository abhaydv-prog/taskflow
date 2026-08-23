import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/taskRepository', () => ({
  findTaskById: vi.fn(),
  findAssignment: vi.fn(),
  createAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
}));

vi.mock('../../src/services/projectService', () => ({
  getProject: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    orgMember: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/jobs/emailQueue', () => ({
  enqueueAssignmentEmail: vi.fn(),
}));

import * as repo from '../../src/repositories/taskRepository';
import * as projectService from '../../src/services/projectService';
import { prisma } from '../../src/lib/prisma';
import { enqueueAssignmentEmail } from '../../src/jobs/emailQueue';
import { assignTask, unassignTask } from '../../src/services/taskService';

const ORG_ID = 'org-1';
const TASK_ID = 'task-1';
const USER_ID = 'user-2';
const mockTask = { id: TASK_ID, projectId: 'project-1', title: 'Ship the feature' };

beforeEach(() => {
  vi.clearAllMocks();
  (repo.findTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
  (projectService.getProject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'project-1', orgId: ORG_ID });
});

describe('assignTask — validation', () => {
  it('throws TASK_NOT_FOUND (404) when the task does not exist', async () => {
    (repo.findTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(assignTask(ORG_ID, 'missing-task', USER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('propagates 403 FORBIDDEN when the task belongs to a project in another org (cross-tenant)', async () => {
    (projectService.getProject as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('forbidden'), { statusCode: 403, code: 'FORBIDDEN' })
    );

    await expect(assignTask(ORG_ID, TASK_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('throws USER_NOT_IN_ORG (400) when the assignee does not belong to the same org as the task', async () => {
    (prisma.orgMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(assignTask(ORG_ID, TASK_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 400,
      code: 'USER_NOT_IN_ORG',
    });

    expect(prisma.orgMember.findUnique).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
    });
    // Must never create an assignment for an out-of-org user.
    expect(repo.createAssignment).not.toHaveBeenCalled();
  });

  it('throws ALREADY_ASSIGNED (409) when the user is already assigned to this task', async () => {
    (prisma.orgMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
    (repo.findAssignment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'assignment-1' });

    await expect(assignTask(ORG_ID, TASK_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_ASSIGNED',
    });
    expect(repo.createAssignment).not.toHaveBeenCalled();
  });

  it('creates the assignment and enqueues an email notification on success', async () => {
    (prisma.orgMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
    (repo.findAssignment as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (repo.createAssignment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'assignment-1', taskId: TASK_ID, userId: USER_ID });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: USER_ID, email: 'assignee@example.com' });

    const result = await assignTask(ORG_ID, TASK_ID, USER_ID);

    expect(repo.createAssignment).toHaveBeenCalledWith(TASK_ID, USER_ID);
    expect(enqueueAssignmentEmail).toHaveBeenCalledWith({
      taskId: TASK_ID,
      taskTitle: mockTask.title,
      assigneeUserId: USER_ID,
      assigneeEmail: 'assignee@example.com',
    });
    expect(result).toEqual({ id: 'assignment-1', taskId: TASK_ID, userId: USER_ID });
  });

  it('still returns the created assignment even if enqueueing the email fails (best-effort, per documented consistency strategy)', async () => {
    (prisma.orgMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
    (repo.findAssignment as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (repo.createAssignment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'assignment-1', taskId: TASK_ID, userId: USER_ID });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: USER_ID, email: 'assignee@example.com' });
    (enqueueAssignmentEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis is down'));

    const result = await assignTask(ORG_ID, TASK_ID, USER_ID);

    // The assignment is the source of truth — it must not roll back just
    // because the notification failed to enqueue.
    expect(result).toEqual({ id: 'assignment-1', taskId: TASK_ID, userId: USER_ID });
  });

  it('does not enqueue an email if the assignee user record is somehow not found', async () => {
    (prisma.orgMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
    (repo.findAssignment as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (repo.createAssignment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'assignment-1' });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await assignTask(ORG_ID, TASK_ID, USER_ID);

    expect(enqueueAssignmentEmail).not.toHaveBeenCalled();
  });
});

describe('unassignTask — validation', () => {
  it('throws TASK_NOT_FOUND (404) when the task does not exist', async () => {
    (repo.findTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(unassignTask(ORG_ID, 'missing-task', USER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('throws ASSIGNMENT_NOT_FOUND (404) when the user is not currently assigned', async () => {
    (repo.findAssignment as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(unassignTask(ORG_ID, TASK_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ASSIGNMENT_NOT_FOUND',
    });
    expect(repo.deleteAssignment).not.toHaveBeenCalled();
  });

  it('deletes the assignment when it exists', async () => {
    (repo.findAssignment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'assignment-1' });
    (repo.deleteAssignment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'assignment-1' });

    await unassignTask(ORG_ID, TASK_ID, USER_ID);

    expect(repo.deleteAssignment).toHaveBeenCalledWith(TASK_ID, USER_ID);
  });
});