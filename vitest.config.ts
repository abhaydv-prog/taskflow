import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/loadEnv.ts', './tests/setup/mockQueue.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});