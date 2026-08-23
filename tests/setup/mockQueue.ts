import { vi } from 'vitest';

// src/jobs/emailQueue.ts does `new Queue(...)` at MODULE LOAD TIME, and
// src/app.ts transitively imports it (app -> taskItemRoutes -> taskController
// -> taskService -> emailQueue). That means simply importing `app` for
// supertest — even in tests that never touch task assignment — would try
// to open a real Redis connection unless bullmq is mocked here first.
//
// This does NOT test "assignment enqueues a job" (that's the bonus test,
// intentionally skipped for now per project decision) — it only makes
// sure normal CRUD/auth tests don't need Redis running to pass.
vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
    getJob = vi.fn().mockResolvedValue(null);
  }

  class MockWorker {
    constructor() {}
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  }

  return { Queue: MockQueue, Worker: MockWorker };
});