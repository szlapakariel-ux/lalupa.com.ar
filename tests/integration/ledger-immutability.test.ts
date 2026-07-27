/**
 * Inmutabilidad FÍSICA de LedgerMovement (auditoría P1-02).
 *
 * Estas pruebas ejecutan SQL directo contra PostgreSQL real: verifican que
 * el trigger de la migración 20260725180000_ledger_immutability rechaza
 * UPDATE y DELETE, que INSERT sigue permitido y que los flujos
 * compensatorios (reversión, corrección, cancelación) siguen funcionando.
 *
 * Alcance: la protección bloquea mutaciones por la conexión normal de la
 * aplicación; un administrador total de PostgreSQL siempre puede alterar la
 * infraestructura deliberadamente (eso se mitiga con permisos y backups).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { registerAttendance, revertAttendance } from "@/server/services/attendance";
import { applyCorrection, cancelPack } from "@/server/services/packs";
import { todayYMD } from "@/lib/dates";
import {
  makeActivity,
  makeAdmin,
  makeEnrollment,
  makePackWithCredit,
  makeProduct,
  makeStudent,
  makeTeacher,
  packBalance,
  resetDb,
} from "./helpers";

const IMMUTABLE_RE = /inmutable/i;

async function fixture() {
  const admin = await makeAdmin();
  const teacher = await makeTeacher();
  const student = await makeStudent();
  const activity = await makeActivity();
  await makeEnrollment({ studentId: student.id, disciplineId: activity.disciplineId });
  const product = await makeProduct();
  const pack = await makePackWithCredit({
    studentId: student.id,
    productId: product.id,
    classCount: 4,
    createdById: admin.id,
  });
  return { admin, teacher, student, activity, product, pack };
}

describe("LedgerMovement inmutable en PostgreSQL", () => {
  beforeEach(resetDb);

  it("INSERT sigue permitido (acreditación de pack)", async () => {
    const f = await fixture();
    expect(await packBalance(f.pack.id)).toBe(4);
    const count = await prisma.ledgerMovement.count();
    expect(count).toBe(1);
  });

  it("UPDATE por SQL directo es rechazado y la fila queda intacta", async () => {
    const f = await fixture();
    const original = await prisma.ledgerMovement.findFirstOrThrow({
      where: { studentPackId: f.pack.id },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "LedgerMovement" SET "delta" = 999, "note" = 'hackeado' WHERE "id" = '${original.id}'`,
      ),
    ).rejects.toThrow(IMMUTABLE_RE);

    const after = await prisma.ledgerMovement.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(after.delta).toBe(original.delta);
    expect(after.note).toBe(original.note);
    expect(after.type).toBe(original.type);
  });

  it("UPDATE mediante el cliente Prisma también es rechazado", async () => {
    const f = await fixture();
    const original = await prisma.ledgerMovement.findFirstOrThrow({
      where: { studentPackId: f.pack.id },
    });

    await expect(
      prisma.ledgerMovement.update({
        where: { id: original.id },
        data: { delta: 0 },
      }),
    ).rejects.toThrow(IMMUTABLE_RE);

    const after = await prisma.ledgerMovement.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(after.delta).toBe(original.delta);
  });

  it("DELETE por SQL directo es rechazado y no desaparece ningún movimiento", async () => {
    const f = await fixture();
    const before = await prisma.ledgerMovement.count();

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "LedgerMovement"`),
    ).rejects.toThrow(IMMUTABLE_RE);
    await expect(
      prisma.ledgerMovement.deleteMany({ where: { studentPackId: f.pack.id } }),
    ).rejects.toThrow(IMMUTABLE_RE);

    expect(await prisma.ledgerMovement.count()).toBe(before);
  });

  it("la reversión legítima crea un movimiento nuevo y conserva el débito original", async () => {
    const f = await fixture();
    const att = await registerAttendance({
      studentId: f.student.id,
      activityId: f.activity.id,
      dateYMD: todayYMD(),
      status: "PRESENTE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    expect(await packBalance(f.pack.id)).toBe(3);

    await revertAttendance({
      attendanceId: att.attendanceId,
      reason: "Marcada por error",
      userId: f.admin.id,
    });

    expect(await packBalance(f.pack.id)).toBe(4);
    // El débito original sigue intacto; la reversión es una fila NUEVA.
    const debit = await prisma.ledgerMovement.findUniqueOrThrow({
      where: { id: att.movementId! },
    });
    expect(debit.delta).toBe(-1);
    expect(debit.type).toBe("CLASS_USED");
    const reversal = await prisma.ledgerMovement.findFirstOrThrow({
      where: { type: "REVERSAL", reversalOfId: debit.id },
    });
    expect(reversal.delta).toBe(1);
  });

  it("la corrección legítima crea un movimiento nuevo sin tocar el histórico", async () => {
    const f = await fixture();
    await applyCorrection({
      studentPackId: f.pack.id,
      type: "CORRECTION_NEG",
      amount: 1,
      reason: "Ajuste administrativo",
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    expect(await packBalance(f.pack.id)).toBe(3);
    expect(
      await prisma.ledgerMovement.count({ where: { studentPackId: f.pack.id } }),
    ).toBe(2);
    const purchase = await prisma.ledgerMovement.findFirstOrThrow({
      where: { studentPackId: f.pack.id, type: "PACK_PURCHASE" },
    });
    expect(purchase.delta).toBe(4);
  });

  it("la cancelación legítima debita por movimiento nuevo y conserva el histórico", async () => {
    const f = await fixture();
    const result = await cancelPack({
      studentPackId: f.pack.id,
      reason: "Devolución",
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    expect(result.cancelledBalance).toBe(4);
    expect(await packBalance(f.pack.id)).toBe(0);
    const cancellation = await prisma.ledgerMovement.findFirstOrThrow({
      where: { studentPackId: f.pack.id, type: "CANCELLATION" },
    });
    expect(cancellation.delta).toBe(-4);
  });
});

describe("migración incremental sobre una base con movimientos existentes", () => {
  const INC_DB = "lalupa_incremental";
  const INC_URL = `postgresql://postgres:postgres@localhost:5434/${INC_DB}`;
  const MIGRATIONS = path.resolve("prisma/migrations");
  const INIT_SQL = path.join(MIGRATIONS, "20260725152742_init", "migration.sql");
  const LEDGER_SQL = path.join(
    MIGRATIONS,
    "20260725180000_ledger_immutability",
    "migration.sql",
  );

  function prismaDbExecute(file: string, url: string) {
    execFileSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "db", "execute", "--file", file, "--url", url],
      { stdio: "pipe" },
    );
  }

  let inc: PrismaClient | null = null;

  afterAll(async () => {
    await inc?.$disconnect();
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${INC_DB}" WITH (FORCE)`);
  });

  it("el trigger se aplica sobre datos preexistentes y los protege sin alterarlos", async () => {
    // Base "vieja": solo la migración inicial, con un movimiento ya cargado.
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${INC_DB}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${INC_DB}"`);
    prismaDbExecute(INIT_SQL, INC_URL);

    inc = new PrismaClient({ datasourceUrl: INC_URL });
    const admin = await inc.user.create({
      data: { email: "admin@inc.local", name: "Admin", passwordHash: "x", role: "ADMIN" },
    });
    const student = await inc.student.create({
      data: { firstName: "Alumna", lastName: "Histórica" },
    });
    const movement = await inc.ledgerMovement.create({
      data: {
        studentId: student.id,
        type: "CORRECTION_POS",
        delta: 2,
        note: "movimiento histórico",
        createdById: admin.id,
      },
    });

    // Sin la migración nueva, la base vieja SÍ aceptaba mutaciones.
    await inc.$executeRawUnsafe(
      `UPDATE "LedgerMovement" SET "note" = 'histórico editado antes del trigger' WHERE "id" = '${movement.id}'`,
    );

    // Se aplica la migración nueva sobre la base con datos.
    prismaDbExecute(LEDGER_SQL, INC_URL);

    // Desde ahora: UPDATE y DELETE rechazados, datos previos intactos.
    await expect(
      inc.$executeRawUnsafe(`UPDATE "LedgerMovement" SET "delta" = 0`),
    ).rejects.toThrow(IMMUTABLE_RE);
    await expect(
      inc.$executeRawUnsafe(`DELETE FROM "LedgerMovement"`),
    ).rejects.toThrow(IMMUTABLE_RE);

    const preserved = await inc.ledgerMovement.findUniqueOrThrow({
      where: { id: movement.id },
    });
    expect(preserved.delta).toBe(2);
    expect(preserved.note).toBe("histórico editado antes del trigger");

    // INSERT sigue permitido después de la migración.
    const nuevo = await inc.ledgerMovement.create({
      data: {
        studentId: student.id,
        type: "CORRECTION_NEG",
        delta: -1,
        note: "compensación posterior",
        createdById: admin.id,
      },
    });
    expect(nuevo.id).toBeTruthy();
    expect(await inc.ledgerMovement.count()).toBe(2);
  }, 120_000);
});
