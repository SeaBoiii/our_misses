import { defineConfig, devices } from '@playwright/test'

const browser = {
  ...devices['iPhone 13'],
  defaultBrowserType: 'chromium' as const,
  // Locally, use the installed Edge instead of downloading Playwright's Chromium.
  channel: process.env.CI ? undefined : 'msedge',
  trace: 'retain-on-failure' as const,
  // The service worker would answer some requests before Playwright's mocks could.
  serviceWorkers: 'block' as const,
}

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  projects: [
    { name: 'demo', testMatch: 'demo.spec.ts', use: { ...browser, baseURL: 'http://127.0.0.1:4179' } },
    { name: 'live-mock', testMatch: 'live.spec.ts', use: { ...browser, baseURL: 'http://127.0.0.1:4180' } },
  ],
  webServer: [
    { command: 'npx vite preview --host 127.0.0.1 --port 4179 --strictPort', url: 'http://127.0.0.1:4179', reuseExistingServer: !process.env.CI },
    { command: 'npx vite preview --host 127.0.0.1 --outDir dist-live --port 4180 --strictPort', url: 'http://127.0.0.1:4180', reuseExistingServer: !process.env.CI },
  ],
})
