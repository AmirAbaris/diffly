import os from "node:os"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const E2E_BACKEND_PORT = process.env.E2E_BACKEND_PORT || "8001"
const E2E_FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || "3001"
const E2E_DB_PATH =
  process.env.E2E_DB_PATH || path.join(os.tmpdir(), "diffly-e2e-test.db")

const backendUrl = `http://127.0.0.1:${E2E_BACKEND_PORT}`
const frontendUrl = `http://127.0.0.1:${E2E_FRONTEND_PORT}`

const backendCommand = [
  'node -e "',
  "const fs=require('fs'),{spawn}=require('child_process');",
  "try{fs.unlinkSync(process.env.E2E_DB_PATH)}catch{}",
  "const bin=fs.existsSync('.venv/bin/uvicorn')?'.venv/bin/uvicorn':'uvicorn';",
  "const c=spawn(bin,['api.index:app','--host','127.0.0.1','--port',process.env.E2E_BACKEND_PORT],{stdio:'inherit'});",
  "process.on('SIGTERM',()=>c.kill('SIGTERM'));",
  "c.on('exit',code=>process.exit(code??0));",
  '"',
].join("")

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: frontendUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: backendCommand,
      url: `${backendUrl}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        DATABASE_URL: `sqlite:///${E2E_DB_PATH}`,
        E2E_DB_PATH,
        E2E_BACKEND_PORT,
        ENVIRONMENT: "development",
      },
    },
    {
      command: `pnpm exec next dev -p ${E2E_FRONTEND_PORT} -H 127.0.0.1`,
      url: `${frontendUrl}/challenges`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        BACKEND_URL: backendUrl,
      },
    },
  ],
})
