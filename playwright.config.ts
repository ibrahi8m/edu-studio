// This container has no locale set; Chromium then refuses non-ASCII download names
// (an Arabic PNG name becomes "download"). Real Windows, macOS and Android systems use UTF-8.
if (!process.env.LANG) process.env.LANG = 'C.UTF-8';
if (!process.env.LC_ALL) process.env.LC_ALL = 'C.UTF-8';

import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'tests/e2e',
  // 1.5.0: every test starts signed in as a test admin (see tests/e2e/auth-setup.ts)
  globalSetup: './tests/e2e/auth-setup.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'retain-on-failure', actionTimeout: 15_000, storageState: 'tests/e2e/.auth/admin.json' },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'tablet-ipad-mini', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
    { name: 'phone-pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'phone-iphone-se', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
  ],
});
