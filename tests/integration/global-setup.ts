/**
 * Levanta un PostgreSQL embebido efímero para los tests de integración
 * (puerto 5434) y aplica las migraciones reales con `prisma migrate deploy`.
 * Sin Docker: binarios precompilados, funciona en Windows.
 */
import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(".pg-data/test");
const PORT = 5434;
const URL = `postgresql://postgres:postgres@localhost:${PORT}/lalupa_test`;

let pg: EmbeddedPostgres;

export async function setup() {
  // Base limpia en cada corrida: valida la migración sobre esquema vacío.
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("lalupa_test");

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: URL },
    stdio: "inherit",
  });
}

export async function teardown() {
  await pg?.stop();
}
