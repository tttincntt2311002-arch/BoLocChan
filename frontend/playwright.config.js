import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const executable =
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
const python =
  process.env.PYTHON ||
  [
    path.resolve(root, '../backend/.venv', executable),
    path.resolve(root, '../.venv', executable),
  ].find(existsSync) ||
  'python'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // First navigation also compiles Vite dependencies after a clean npm ci.
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    browserName: 'chromium',
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `node "${path.join(root, 'tests/start_chain.cjs')}"`,
      url: 'http://127.0.0.1:18546/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
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
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:8011/api/v1',
        VITE_CHAIN_ID: '31337',
        VITE_CHAIN_NAME: 'Hardhat Test',
        VITE_RPC_URL: 'http://127.0.0.1:18546',
        VITE_SBT_CONTRACT_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      },
      timeout: 60000,
    },
  ],
})
