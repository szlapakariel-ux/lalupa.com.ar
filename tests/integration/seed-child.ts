/**
 * Proceso HIJO para las pruebas de concurrencia del bootstrap productivo.
 * (No es un archivo de test: Vitest solo levanta *.test.ts.)
 *
 * Protocolo de barrera para garantizar solapamiento real, sin sleeps:
 *  1. conecta a PostgreSQL y escribe "READY" en stdout;
 *  2. espera la señal "GO" por stdin (el padre la envía a todos a la vez);
 *  3. recién entonces ejecuta el bootstrap y reporta el resultado:
 *     - RESULT:CREATED  (exit 0): esta ejecución creó la administradora;
 *     - RESULT:EXISTING (exit 0): idempotente, la cuenta ya existía;
 *     - RESULT:REJECTED (exit 30): rechazo esperado por reglas del bootstrap;
 *     - exit 1: error inesperado.
 */
import { PrismaClient } from "@prisma/client";
import { SeedConfigError, seedProductionAdmin } from "../../prisma/seed-admin";

const prisma = new PrismaClient();

function waitForGo(): Promise<void> {
  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.on("data", (chunk) => {
      buffer += String(chunk);
      if (buffer.includes("GO")) resolve();
    });
  });
}

async function main() {
  await prisma.$connect();
  process.stdout.write("READY\n");
  await waitForGo();

  const result = await seedProductionAdmin(prisma, {
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  });
  process.stdout.write(result.created ? "RESULT:CREATED\n" : "RESULT:EXISTING\n");
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((e) => {
    if (e instanceof SeedConfigError) {
      process.stdout.write(`RESULT:REJECTED ${e.message}\n`);
      process.exitCode = 30;
    } else {
      console.error(e);
      process.exitCode = 1;
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
