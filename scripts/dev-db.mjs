// Levanta un PostgreSQL embebido para DESARROLLO local (sin Docker).
// Uso: node scripts/dev-db.mjs  (queda corriendo; Ctrl+C para frenar)
// La app espera DATABASE_URL=postgresql://postgres:postgres@localhost:5433/lalupa
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(".pg-data/dev");
const alreadyInitialised = existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
});

if (!alreadyInitialised) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("lalupa");
} catch {
  // ya existe
}
console.log("PostgreSQL de desarrollo listo en puerto 5433 (base: lalupa).");
console.log("DATABASE_URL=postgresql://postgres:postgres@localhost:5433/lalupa");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
