import { defineConfig, devices } from '@playwright/test';

// 在 Docker 的 verify 服务中通过 BASE_URL 指向 web 服务；
// 本地运行时自动构建并启动 vite preview。
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
