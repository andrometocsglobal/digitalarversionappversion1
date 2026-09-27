import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
// Uses the installed Google Chrome by default; set PW_CHANNEL= (empty) to use
// Playwright's bundled Chromium after `npx playwright install chromium`.
const channel = process.env.PW_CHANNEL ?? 'chrome';

const media = {
  channel: channel || undefined,
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...media } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...media }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'node server/index.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), OMNI_DATA_DIR: 'test-results/server-data' },
  },
});
