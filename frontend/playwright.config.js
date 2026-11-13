import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const python = path.resolve(root, '../backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `"${python}" "${path.join(root, 'tests/start_api.py')}"`,
      url: 'http://127.0.0.1:8011/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: `${npm} run dev -- --host 127.0.0.1 --port 5178 --strictPort`,
      url: 'http://127.0.0.1:5178',
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:8011/api/v1' },
      timeout: 60000,
    },
  ],
})
