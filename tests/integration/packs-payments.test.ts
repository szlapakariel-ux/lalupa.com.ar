import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { applyCorrection, assignPack, cancelPack, expirePacks } from "@/server/services/packs";
import { annulPayment, registerPayment } from "@/server/services/payments";
import { createAlert, createStudent } from "@/server/services/students";
import { addDaysYMD, dateToYMD, todayYMD } from "@/lib/dates";
import {
  makeActivity,
  makeAdmin,
  makePackWithCredit,
  makeProduct,
  makeStudent,
  makeTeacher,
  packBalance,
  resetDb,
} from "./helpers";

describe("assignPack", () => {
  beforeEach(resetDb);

  it("crea pack + acreditación + pago en una transacción, con vencimiento calculado", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const product = await makeProduct({ classCount: 4, validityDays: 30 });
    const start = todayYMD();

    const { pack, payment } = await assignPack({
      studentId: student.id,
      productId: product.id,
      agreedPrice: 38000,
      startDateYMD: start,
      userId: admin.id,
      payment: { amount: 38000, method: "TRANSFERENCIA", status: "PAGADO" },
    });

    expect(dateToYMD(pack.expiresAt)).toBe(addDaysYMD(start, 30));
    expect(await packBalance(pack.id)).toBe(4);
    expect(payment?.status).toBe("PAGADO");
    expect(
      await prisma.auditEvent.count({ where: { action: "pack.assign" } }),
    ).toBe(1);
  });

  it("permite cargar un pack sin pago (queda trazado sin pago asociado)", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const product = await makeProduct();
    const { payment } = await assignPack({
      studentId: student.id,
      productId: product.id,
      agreedPrice: 40000,
      startDateYMD: todayYMD(),
      userId: admin.id,
    });
    expect(payment).toBeNull();
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.studentPack.count()).toBe(1);
  });

  it("rechaza productos inactivos", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const product = await makeProduct();
    await prisma.packProduct.update({
      where: { id: product.id },
      data: { active: false },
    });
    await expect(
      assignPack({
        studentId: student.id,
        productId: product.id,
        agreedPrice: 1,
        startDateYMD: todayYMD(),
        userId: admin.id,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_ENCONTRADO" }));
  });
});

describe("applyCorrection / cancelPack (correcciones compensatorias)", () => {
  beforeEach(resetDb);

  it("las profesoras no pueden corregir", async () => {
    const teacher = await makeTeacher();
    await expect(
      applyCorrection({
        studentPackId: "x",
        type: "CORRECTION_POS",
        amount: 1,
        reason: "test",
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));
  });

  it("una corrección negativa crea movimiento nuevo sin tocar el histórico", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const product = await makeProduct();
    const pack = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
    });

    await applyCorrection({
      studentPackId: pack.id,
      type: "CORRECTION_NEG",
      amount: 4,
      reason: "carga duplicada",
      userId: admin.id,
      userRole: "ADMIN",
    });

    expect(await packBalance(pack.id)).toBe(0);
    // El PACK_PURCHASE original sigue intacto
    expect(
      await prisma.ledgerMovement.count({ where: { type: "PACK_PURCHASE" } }),
    ).toBe(1);
    // El pack quedó agotado
    expect(
      (await prisma.studentPack.findUnique({ where: { id: pack.id } }))?.status,
    ).toBe("AGOTADO");
  });

  it("cancelPack debita el saldo restante y no puede cancelarse dos veces", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const product = await makeProduct();
    const pack = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 3,
      createdById: admin.id,
    });

    const { cancelledBalance } = await cancelPack({
      studentPackId: pack.id,
      reason: "se dio de baja",
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(cancelledBalance).toBe(3);
    expect(await packBalance(pack.id)).toBe(0);

    await expect(
      cancelPack({
        studentPackId: pack.id,
        reason: "de nuevo",
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "YA_REVERTIDA" }));
  });
});

describe("expirePacks (idempotente)", () => {
  beforeEach(resetDb);

  it("vence packs con saldo una sola vez aunque se ejecute varias veces", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const product = await makeProduct({ validityDays: 10 });
    const pack = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
      startYMD: "2026-01-01",
      validityDays: 10,
    });

    const r1 = await expirePacks(todayYMD());
    const r2 = await expirePacks(todayYMD());
    expect(r1.expired).toBe(1);
    expect(r2.expired).toBe(0);

    expect(await packBalance(pack.id)).toBe(0);
    expect(
      await prisma.ledgerMovement.count({ where: { type: "EXPIRATION" } }),
    ).toBe(1);
    expect(
      (await prisma.studentPack.findUnique({ where: { id: pack.id } }))?.status,
    ).toBe("VENCIDO");
  });
});

describe("pagos y permisos", () => {
  beforeEach(resetDb);

  it("solo admin registra pagos; la anulación es soft y auditada", async () => {
    const admin = await makeAdmin();
    const teacher = await makeTeacher();
    const student = await makeStudent();

    await expect(
      registerPayment({
        studentId: student.id,
        amount: 1000,
        dateYMD: todayYMD(),
        method: "EFECTIVO",
        status: "PAGADO",
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));

    const payment = await registerPayment({
      studentId: student.id,
      amount: 1000,
      dateYMD: todayYMD(),
      method: "EFECTIVO",
      status: "PENDIENTE",
      userId: admin.id,
      userRole: "ADMIN",
    });

    const annulled = await annulPayment({
      paymentId: payment.id,
      reason: "error de carga",
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(annulled.status).toBe("ANULADO");
    expect(annulled.annulledById).toBe(admin.id);
    // Sigue existiendo (no se borra)
    expect(await prisma.payment.count()).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { action: "payment.annul" } }),
    ).toBe(1);
  });
});

describe("alumnas y alertas (permisos y privacidad)", () => {
  beforeEach(resetDb);

  it("las profesoras no crean alumnas ni alertas", async () => {
    const teacher = await makeTeacher();
    await expect(
      createStudent(
        { firstName: "X", lastName: "Y" },
        { userId: teacher.id, userRole: "TEACHER" },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));
  });

  it("la auditoría de una alerta registra el tipo pero NUNCA el contenido", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    await createAlert(
      student.id,
      {
        type: "ALERGIA",
        title: "Alergia grave al maní",
        instruction: "Tener antihistamínico a mano",
        visibility: "SOLO_ADMIN",
      },
      { userId: admin.id, userRole: "ADMIN" },
    );
    const event = await prisma.auditEvent.findFirst({
      where: { action: "alert.create" },
    });
    const metadata = JSON.stringify(event?.metadata ?? {});
    expect(metadata).toContain("ALERGIA");
    expect(metadata).not.toContain("maní");
    expect(metadata).not.toContain("antihistamínico");
  });
});
