import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/loadEnv.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false, 
  },
});