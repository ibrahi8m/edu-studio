import { defineConfig } from '@playwright/test';
// Desktop (Electron) tests. Run under a display: xvfb-run -a npm run test:desktop
export default defineConfig({
  testDir: 'tests',
  testMatch: ['desktop/**/*.spec.ts', 'desktop-packaged/**/*.spec.ts'],
  timeout: 90_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/desktop-results.json' }]],
});
