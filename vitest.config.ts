import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/test/**/*.test.ts', 'server/test/**/*.test.ts', 'web/test/**/*.test.ts'],
    env: {
      EGRESS_DB_PATH: ':memory:'
    }
  }
});
