import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra un build de producción servido en :3100 y la base de
 * desarrollo embebida (puerto 5433). Requiere la base levantada:
 *   node scripts/dev-db.mjs   (y seed aplicado: npm run db:seed)
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://localhost:3100/api/health",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/lalupa",
      NODE_ENV: "production",
    },
  },
});
