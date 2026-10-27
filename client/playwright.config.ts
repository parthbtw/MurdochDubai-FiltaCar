import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4473',
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'iphone-portrait',
    use: {
      browserName: 'chromium',
      channel: process.env.PW_CHROMIUM === undefined ? 'chrome' : undefined,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    },
  }],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      url: 'http://localhost:3301/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npx vite preview --port 4473 --strictPort',
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      env: { FILTA_API_PORT: '3301' },
      url: 'http://localhost:4473',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
