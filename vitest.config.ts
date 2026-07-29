import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5434/lalupa_test";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    projects: [
      {
        resolve: { alias: { "@": path.resolve(__dirname, "src") } },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias: { "@": path.resolve(__dirname, "src") } },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          env: { DATABASE_URL: TEST_DATABASE_URL },
          // Un solo hilo: los tests comparten la base y se limpian entre sí.
          pool: "threads",
          poolOptions: { threads: { singleThread: true } },
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
