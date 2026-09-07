import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests spin up a real in-memory MongoDB replica set
    // (mongodb-memory-server) so Mongoose sessions/transactions behave
    // exactly like they do against Atlas — that download + startup can take
    // longer than Vitest's 5s default.
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./src/test/envSetup.js'],
  },
});
