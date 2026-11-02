import { defineConfig } from '@playwright/test'

// Browser: the system Edge/Chrome by default (nothing to download). In CI run
// `npx playwright install chromium` and set PW_CHANNEL= (empty) to use the bundled one.
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { channel: channel || undefined, locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1500, height: 950 }, acceptDownloads: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'app', testMatch: /(app|more)\.spec\.js/, use: { baseURL: 'http://localhost:5173' } },
    { name: 'pwa', testMatch: /pwa\.spec\.js/, use: { baseURL: 'http://localhost:4179' } },
    { name: 'integration', testMatch: /integration\.spec\.js/, use: { baseURL: 'http://localhost:5180' } }
  ],
  webServer: [
    { command: 'node tests/mock-backend/server.mjs 3911', url: 'http://localhost:3911', reuseExistingServer: true, timeout: 20_000 },
    { command: 'npx vite --port 5180 --strictPort', url: 'http://localhost:5180', reuseExistingServer: true, timeout: 60_000, env: { VITE_API_BASE_URL: 'http://localhost:3911' } },
    // VITE_API_BASE_URL is set here (not via .env.development, which is git-ignored) so CI behaves like a local run.
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000, env: { VITE_API_BASE_URL: 'http://localhost:3000' } },
    { command: 'npm run build && npm run preview -- --port 4179 --strictPort', url: 'http://localhost:4179', reuseExistingServer: true, timeout: 120_000 }
  ]
})
