/**
 * Runner de las pruebas de integración con exit code CONFIABLE.
 *
 * Motivo (auditoría P2): tras `npm ci` sin Prisma Client generado, Vitest
 * informaba "failed / no tests" pero terminaba con exit 0 — un falso
 * positivo para CI. Este runner:
 *
 *  1. genera Prisma Client SIEMPRE antes de cargar ningún test
 *     (idempotente; no dependemos de postinstall);
 *  2. ejecuta Vitest por su API de Node y decide el exit code según el
 *     estado REAL de la corrida: archivos fallidos, archivos sin resultado,
 *     errores no manejados o cero tests ejecutados ⇒ exit distinto de cero;
 *  3. propaga fallos de global setup/teardown y de configuración (excepción
 *     al iniciar ⇒ exit 1), sin imprimir secretos.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message, code = 1) {
  console.error(`\n[test:int] ${message}`);
  process.exit(code === null || code === 0 ? 1 : code);
}

// ── 1) prisma generate ──────────────────────────────────────────────────────
const prismaCli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
const gen = spawnSync(process.execPath, [prismaCli, "generate"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (gen.error) fail(`prisma generate no pudo ejecutarse: ${gen.error.message}`);
if (gen.signal) fail(`prisma generate terminó por señal ${gen.signal}`);
if (gen.status !== 0) fail(`prisma generate falló (status ${gen.status})`, gen.status);

// ── 2) Vitest por API de Node ───────────────────────────────────────────────
const { startVitest } = await import("vitest/node");

let vitest;
try {
  vitest = await startVitest("test", [], { run: true, project: ["integration"] });
} catch (e) {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  fail("Vitest no pudo iniciar (configuración o global setup).");
}
if (!vitest) fail("Vitest no pudo iniciar.");

function countTests(task) {
  if (task.type === "test") return 1;
  return (task.tasks ?? []).reduce((n, t) => n + countTests(t), 0);
}

let exitCode = 0;
try {
  const files = vitest.state.getFiles();
  const unhandled = vitest.state.getUnhandledErrors();
  const totalTests = files.reduce((n, f) => n + countTests(f), 0);
  const badFiles = files.filter((f) => f.result?.state !== "pass");

  if (files.length === 0) {
    console.error("[test:int] No se cargó ningún archivo de test.");
    exitCode = 1;
  }
  if (totalTests === 0) {
    console.error("[test:int] No se ejecutó ningún test (fallo de carga o suite vacía).");
    exitCode = 1;
  }
  if (badFiles.length > 0) {
    console.error(
      `[test:int] ${badFiles.length} archivo(s) de test sin estado "pass": ${badFiles
        .map((f) => f.name)
        .join(", ")}`,
    );
    exitCode = 1;
  }
  if (unhandled.length > 0) {
    console.error(`[test:int] ${unhandled.length} error(es) no manejado(s) durante la corrida.`);
    exitCode = 1;
  }
} catch (e) {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  exitCode = 1;
}

try {
  await vitest.close();
} catch (e) {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  exitCode = exitCode || 1;
}

process.exit(exitCode);
