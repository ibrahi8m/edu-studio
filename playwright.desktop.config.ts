// This container has no locale set; Chromium then refuses non-ASCII download names
// (an Arabic PNG name becomes "download"). Real Windows, macOS and Android systems use UTF-8.
if (!process.env.LANG) process.env.LANG = 'C.UTF-8';
if (!process.env.LC_ALL) process.env.LC_ALL = 'C.UTF-8';

import { defineConfig } from '@playwright/test';
// Desktop (Electron) tests. Run under a display: xvfb-run -a npm run test:desktop
export default defineConfig({
  testDir: 'tests',
  testMatch: ['desktop/**/*.spec.ts', 'desktop-packaged/**/*.spec.ts'],
  timeout: 90_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/desktop-results.json' }]],
});
