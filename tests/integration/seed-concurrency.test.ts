/**
 * Concurrencia del bootstrap productivo (P1: carrera contar-y-crear).
 *
 * Lanza subprocesos REALES (tsx) contra PostgreSQL real, sincronizados con
 * una barrera READY/GO por stdin para que la ventana contar-y-crear se
 * solape de verdad (sin sleeps ni "probablemente"). La serialización la da
 * pg_advisory_xact_lock dentro de la transacción del bootstrap.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { seedProductionAdmin } from "../../prisma/seed-admin";
import { resetDb } from "./helpers";

const TSX_CLI = path.resolve("node_modules/tsx/dist/cli.mjs");
const CHILD = path.resolve("tests/integration/seed-child.ts");
const STRONG_PASSWORD = "Clave-Segura-2026-xyz";

interface ChildResult {
  code: number | null;
  output: string;
}

interface ChildHandle {
  ready: Promise<void>;
  go: () => void;
  done: Promise<ChildResult>;
}

function launchChild(email: string, password: string): ChildHandle {
  const child = spawn(process.execPath, [TSX_CLI, CHILD], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      SEED_ADMIN_EMAIL: email,
      SEED_ADMIN_PASSWORD: password,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  let markReady: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
    if (output.includes("READY")) markReady();
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  const done = new Promise<ChildResult>((resolve) => {
    child.on("close", (code) => resolve({ code, output }));
  });

  return { ready, go: () => child.stdin.write("GO\n"), done };
}

/** Barrera: espera a que TODOS estén conectados y dispara la largada junta. */
async function runConcurrent(
  specs: Array<{ email: string; password: string }>,
): Promise<ChildResult[]> {
  const children = specs.map((s) => launchChild(s.email, s.password));
  await Promise.all(children.map((c) => c.ready));
  for (const c of children) c.go();
  return Promise.all(children.map((c) => c.done));
}

describe("bootstrap productivo concurrente", () => {
  beforeEach(resetDb);

  it("diez procesos simultáneos con emails DIFERENTES crean exactamente una administradora", async () => {
    const specs = Array.from({ length: 10 }, (_, i) => ({
      email: `admin${i}@lalupa.com.ar`,
      password: `${STRONG_PASSWORD}-${i}`,
    }));
    const results = await runConcurrent(specs);

    const winners = results.filter((r) => r.output.includes("RESULT:CREATED"));
    const rejected = results.filter((r) => r.output.includes("RESULT:REJECTED"));
    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expect(winners[0].code).toBe(0);
    for (const r of rejected) expect(r.code).toBe(30);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("ADMIN");
    expect(specs.map((s) => s.email)).toContain(users[0].email);

    // Ninguna salida contiene contraseña alguna.
    const allOutput = results.map((r) => r.output).join("\n");
    for (const s of specs) expect(allOutput).not.toContain(s.password);
  }, 180_000);

  it("diez procesos simultáneos con el MISMO email son idempotentes: una sola cuenta, mismo hash y rol", async () => {
    const specs = Array.from({ length: 10 }, () => ({
      email: "duena@lalupa.com.ar",
      password: STRONG_PASSWORD,
    }));
    const results = await runConcurrent(specs);

    const winners = results.filter((r) => r.output.includes("RESULT:CREATED"));
    const existing = results.filter((r) => r.output.includes("RESULT:EXISTING"));
    expect(winners).toHaveLength(1);
    expect(existing).toHaveLength(9);
    for (const r of results) expect(r.code).toBe(0);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("duena@lalupa.com.ar");
    expect(users[0].role).toBe("ADMIN");
    const hashAfterBatch = users[0].passwordHash;

    // Una ejecución más (secuencial) sigue siendo idempotente: mismo hash.
    const again = await seedProductionAdmin(
      prisma,
      { SEED_ADMIN_EMAIL: "duena@lalupa.com.ar", SEED_ADMIN_PASSWORD: STRONG_PASSWORD },
      () => {},
    );
    expect(again.created).toBe(false);
    const after = await prisma.user.findUniqueOrThrow({
      where: { email: "duena@lalupa.com.ar" },
    });
    expect(after.passwordHash).toBe(hashAfterBatch);
    expect(after.role).toBe("ADMIN");

    const allOutput = results.map((r) => r.output).join("\n");
    expect(allOutput).not.toContain(STRONG_PASSWORD);
  }, 180_000);

  it("caso mínimo: DOS procesos simultáneos con emails distintos terminan con una sola administradora", async () => {
    const results = await runConcurrent([
      { email: "una@lalupa.com.ar", password: STRONG_PASSWORD },
      { email: "otra@lalupa.com.ar", password: STRONG_PASSWORD },
    ]);

    const winners = results.filter((r) => r.output.includes("RESULT:CREATED"));
    const rejected = results.filter((r) => r.output.includes("RESULT:REJECTED"));
    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await prisma.user.count()).toBe(1);
  }, 120_000);

  it("un fallo dentro del bootstrap hace rollback, libera el lock y un seed válido posterior funciona", async () => {
    // Cliente con fallo inyectado en user.create: la transacción del
    // bootstrap aborta DESPUÉS de adquirir el advisory lock.
    const failing = prisma.$extends({
      query: {
        user: {
          create: async () => {
            throw new Error("fallo inyectado antes de completar la creación");
          },
        },
      },
    }) as unknown as PrismaClient;

    await expect(
      seedProductionAdmin(
        failing,
        { SEED_ADMIN_EMAIL: "duena@lalupa.com.ar", SEED_ADMIN_PASSWORD: STRONG_PASSWORD },
        () => {},
      ),
    ).rejects.toThrow("fallo inyectado");

    // Rollback: no quedó ni usuario ni configuración a medias.
    expect(await prisma.user.count()).toBe(0);

    // Lock liberado: un seed válido inmediato adquiere el lock y crea.
    const ok = await seedProductionAdmin(
      prisma,
      { SEED_ADMIN_EMAIL: "duena@lalupa.com.ar", SEED_ADMIN_PASSWORD: STRONG_PASSWORD },
      () => {},
    );
    expect(ok.created).toBe(true);
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("ADMIN");
  }, 60_000);
});
