/**
 * Seed productivo seguro (auditoría P1-01).
 *
 * Ejecuta prisma/seed.ts como SUBPROCESO real (tsx), con NODE_ENV y
 * variables SEED_ADMIN_* controladas, contra la base de integración.
 * Verifica los escenarios bloqueantes: fallback prohibido, variables
 * incompletas, contraseñas débiles o de desarrollo, idempotencia y que
 * ninguna salida contenga jamás la contraseña.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDb } from "./helpers";

const TSX_CLI = path.resolve("node_modules/tsx/dist/cli.mjs");
const SEED = path.resolve("prisma/seed.ts");
const STRONG_PASSWORD = "Clave-Segura-2026-xyz";

interface SeedRun {
  status: number;
  output: string;
}

function runSeed(opts: {
  nodeEnv: "production" | "development";
  email?: string;
  password?: string;
}): SeedRun {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: opts.nodeEnv };
  delete env.SEED_ADMIN_EMAIL;
  delete env.SEED_ADMIN_PASSWORD;
  if (opts.email !== undefined) env.SEED_ADMIN_EMAIL = opts.email;
  if (opts.password !== undefined) env.SEED_ADMIN_PASSWORD = opts.password;

  try {
    const stdout = execFileSync(process.execPath, [TSX_CLI, SEED], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ""}\n${err.stderr ?? ""}`,
    };
  }
}

describe("prisma/seed.ts en producción", () => {
  beforeEach(resetDb);

  it("sin ninguna variable: omite el seed administrativo y no crea usuarios", async () => {
    const run = runSeed({ nodeEnv: "production" });
    expect(run.status).toBe(0);
    expect(run.output).toMatch(/omitido/i);
    expect(await prisma.user.count()).toBe(0);
    expect(run.output).not.toContain("lupa-admin-dev");
  });

  it("con solo SEED_ADMIN_EMAIL: aborta sin crear usuarios (jamás usa el fallback de desarrollo)", async () => {
    const run = runSeed({ nodeEnv: "production", email: "duena@lalupa.com.ar" });
    expect(run.status).not.toBe(0);
    expect(run.output).toMatch(/JUNTAS/i);
    expect(await prisma.user.count()).toBe(0);
  });

  it("con solo SEED_ADMIN_PASSWORD: aborta sin crear usuarios y sin filtrar la contraseña", async () => {
    const run = runSeed({ nodeEnv: "production", password: STRONG_PASSWORD });
    expect(run.status).not.toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(run.output).not.toContain(STRONG_PASSWORD);
  });

  it("con contraseña demasiado corta: aborta sin crear usuarios", async () => {
    const run = runSeed({
      nodeEnv: "production",
      email: "duena@lalupa.com.ar",
      password: "corta123",
    });
    expect(run.status).not.toBe(0);
    expect(run.output).toMatch(/12 caracteres/);
    expect(await prisma.user.count()).toBe(0);
  });

  it("con la credencial de desarrollo lupa-admin-dev: aborta sin crear usuarios", async () => {
    const run = runSeed({
      nodeEnv: "production",
      email: "duena@lalupa.com.ar",
      password: "lupa-admin-dev",
    });
    expect(run.status).not.toBe(0);
    expect(run.output).toMatch(/desarrollo/i);
    expect(await prisma.user.count()).toBe(0);
  });

  it("con ambas variables válidas y base vacía: crea UNA administradora con hash bcrypt", async () => {
    const run = runSeed({
      nodeEnv: "production",
      email: "Duena@LaLupa.com.ar",
      password: STRONG_PASSWORD,
    });
    expect(run.status).toBe(0);
    expect(run.output).not.toContain(STRONG_PASSWORD);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("duena@lalupa.com.ar");
    expect(users[0].role).toBe("ADMIN");
    expect(users[0].passwordHash.startsWith("$2")).toBe(true);
    expect(users[0].passwordHash).not.toContain(STRONG_PASSWORD);

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings).not.toBeNull();
  });

  it("segunda ejecución con las mismas variables: idempotente, sin cambiar contraseña ni crear otra cuenta", async () => {
    const first = runSeed({
      nodeEnv: "production",
      email: "duena@lalupa.com.ar",
      password: STRONG_PASSWORD,
    });
    expect(first.status).toBe(0);
    const before = await prisma.user.findUniqueOrThrow({
      where: { email: "duena@lalupa.com.ar" },
    });

    const second = runSeed({
      nodeEnv: "production",
      email: "duena@lalupa.com.ar",
      password: STRONG_PASSWORD,
    });
    expect(second.status).toBe(0);
    expect(second.output).not.toContain(STRONG_PASSWORD);

    const after = await prisma.user.findMany();
    expect(after).toHaveLength(1);
    expect(after[0].passwordHash).toBe(before.passwordHash);
    expect(after[0].role).toBe("ADMIN");
  });

  it("con otro email cuando ya existe un usuario: aborta y NO crea una segunda administradora", async () => {
    const first = runSeed({
      nodeEnv: "production",
      email: "duena@lalupa.com.ar",
      password: STRONG_PASSWORD,
    });
    expect(first.status).toBe(0);

    const second = runSeed({
      nodeEnv: "production",
      email: "otra@ejemplo.com",
      password: "Otra-Clave-Fuerte-2026",
    });
    expect(second.status).not.toBe(0);
    expect(second.output).toMatch(/PRIMERA administradora/i);
    expect(second.output).not.toContain("Otra-Clave-Fuerte-2026");

    expect(await prisma.user.count()).toBe(1);
    expect(
      await prisma.user.findUnique({ where: { email: "otra@ejemplo.com" } }),
    ).toBeNull();
  });
});

describe("prisma/seed.ts en desarrollo", () => {
  beforeEach(resetDb);

  it("sin variables: crea las cuentas ficticias locales y los datos de ejemplo", async () => {
    const run = runSeed({ nodeEnv: "development" });
    expect(run.status).toBe(0);

    const admin = await prisma.user.findUnique({
      where: { email: "admin@lalupa.local" },
    });
    expect(admin?.role).toBe("ADMIN");
    const profe = await prisma.user.findUnique({
      where: { email: "profe@lalupa.local" },
    });
    expect(profe?.role).toBe("TEACHER");
    expect(await prisma.student.count()).toBeGreaterThan(0);
    expect(await prisma.ledgerMovement.count()).toBeGreaterThan(0);
  }, 60_000);
});
