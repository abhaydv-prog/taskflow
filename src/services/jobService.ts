import { emailQueue } from '../jobs/emailQueue';
import { deadLetterQueue, DLQ_NAME } from '../jobs/deadLetterQueue';
import { EMAIL_QUEUE_NAME } from '../jobs/emailQueue';
import { AppError } from '../middleware/errorHandler';

// Maps BullMQ's internal job states to the assignment's required
// vocabulary: pending, active, completed, failed.
const STATUS_MAP: Record<string, string> = {
  waiting: 'pending',
  delayed: 'pending',
  'waiting-children': 'pending',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

export async function getJobStatus(jobId: string) {
  // Check the main queue first, then the dead-letter queue.
  let job = await emailQueue.getJob(jobId);
  let queueName = EMAIL_QUEUE_NAME;

  if (!job) {
    job = await deadLetterQueue.getJob(jobId);
    queueName = DLQ_NAME;
  }

  if (!job) {
    throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
  }

  const state = await job.getState();

  return {
    id: job.id,
    status: STATUS_MAP[state] ?? state,
    queue: queueName,
    attemptsMade: job.attemptsMade,
    data: job.data,
    failedReason: job.failedReason ?? null,
    createdAt: new Date(job.timestamp).toISOString(),
  };
}