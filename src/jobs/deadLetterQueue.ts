import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis';

export const DLQ_NAME = 'email-notifications-dlq';

// Just a Queue reference — no Worker. Safe to import from anywhere
// (API process for job-status lookups, worker process for pushing
// failed jobs into it) without accidentally starting a job consumer
// in the wrong process.
export const deadLetterQueue = new Queue(DLQ_NAME, { connection: redisConnection });