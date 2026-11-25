// Runs the generated tests (tests.json) against one FoodDash build: BUILD=learn|battle|bug, BASE_URL.
// Started by run.mjs. VIDEO=1 records every test, SLOWMO=ms slows it down.
import { defineConfig, devices } from '@playwright/test'

const build = process.env.BUILD || 'battle'
export default defineConfig({
  testDir: './tests',
  outputDir: `./test-results/${build}`,
  fullyParallel: true,
  workers: process.env.VIDEO ? 1 : 4,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BASE_URL || 'http://localhost:4174',
    headless: true,
    viewport: { width: 1280, height: 720 },
    video: process.env.VIDEO ? { mode: 'on', size: { width: 1280, height: 720 } } : 'off',
    launchOptions: { slowMo: Number(process.env.SLOWMO || 0) },
  },
})
