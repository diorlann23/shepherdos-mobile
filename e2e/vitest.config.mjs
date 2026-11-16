// Phone simulator tests: the app's real sync code against a running ShepherdOS server.
// Run with `npm run test:e2e` (see e2e/README.md). No dependency of the app is needed.
import { fileURLToPath } from 'node:url';

export default {
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    setupFiles: ['e2e/phone-mocks.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
};
