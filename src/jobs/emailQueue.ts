import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis';

export const EMAIL_QUEUE_NAME = 'email-notifications';

export interface AssignmentEmailJobData {
  taskId: string;
  taskTitle: string;
  assigneeUserId: string;
  assigneeEmail: string;
}

export const emailQueue = new Queue<AssignmentEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    // 3 retries after the first attempt = 4 total attempts, with delays
    // of 1s, 2s, 4s between them (exponential backoff, base 1000ms).
    // Matches assignment spec exactly: "Retry failed jobs 3 times,
    // exponential backoff: 1s -> 2s -> 4s".
    attempts: 4,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 3600 }, // keep 1hr so GET /jobs/:id can still find completed jobs
    removeOnFail: false, // keep failed jobs visible — acts as part of the dead-letter trail
  },
});

// Bonus: deduplicate assignments within a short window. Using a
// deterministic jobId means calling this twice for the same
// task+assignee before the first job finishes/is removed is a no-op —
// BullMQ won't create a duplicate. This is a simpler stand-in for a
// strict 5-second window (a time-boxed version would need a Redis
// SET NX EX 5 lock instead); stated here as the assumption made.
export async function enqueueAssignmentEmail(data: AssignmentEmailJobData) {
  const jobId = `assign-email:${data.taskId}:${data.assigneeUserId}`;
  return emailQueue.add('assignment-email', data, { jobId });
}