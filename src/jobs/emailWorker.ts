import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { EMAIL_QUEUE_NAME, AssignmentEmailJobData } from './emailQueue';
import { deadLetterQueue } from './deadLetterQueue';

// Mock email sending — explicitly allowed by the assignment spec.
async function sendMockEmail(data: AssignmentEmailJobData) {
  console.log(`[email] Sending assignment notification to ${data.assigneeEmail} for task "${data.taskTitle}"`);
  await new Promise((resolve) => setTimeout(resolve, 200)); // simulate network latency
  // A real implementation would call an email provider (SES/SendGrid/etc.) here.
}

export const emailWorker = new Worker<AssignmentEmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job) => {
    await sendMockEmail(job.data);
  },
  { connection: redisConnection }
);

emailWorker.on('failed', async (job, err) => {
  if (!job) return;

  const attempts = job.opts.attempts ?? 1;
  const exhausted = job.attemptsMade >= attempts;

  if (exhausted) {
    console.error(`[email] Job ${job.id} exhausted all ${attempts} attempts, moving to dead-letter queue:`, err.message);
    await deadLetterQueue.add('failed-assignment-email', {
      ...job.data,
      originalJobId: job.id,
      failureReason: err.message,
      failedAt: new Date().toISOString(),
    });
  } else {
    console.warn(`[email] Job ${job.id} failed (attempt ${job.attemptsMade}/${attempts}), will retry:`, err.message);
  }
});

emailWorker.on('completed', (job) => {
  console.log(`[email] Job ${job.id} completed successfully`);
});