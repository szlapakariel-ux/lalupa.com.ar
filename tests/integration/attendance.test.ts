import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { registerAttendance, revertAttendance } from "@/server/services/attendance";
import { DomainError } from "@/lib/errors";
import { addDaysYMD, todayYMD } from "@/lib/dates";
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

describe("registerAttendance (transaccional)", () => {
  beforeEach(resetDb);

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

  it("PRESENTE descuenta exactamente una clase y deja asistencia + movimiento + auditoría", async () => {
    const f = await fixture();
    const result = await registerAttendance({
      studentId: f.student.id,
      activityId: f.activity.id,
      dateYMD: todayYMD(),
      status: "PRESENTE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });

    expect(result.consumed).toBe(true);
    expect(result.balanceBefore).toBe(4);
    expect(result.balanceAfter).toBe(3);
    expect(await packBalance(f.pack.id)).toBe(3);

    const attendance = await prisma.attendance.findUnique({
      where: { id: result.attendanceId },
    });
    expect(attendance?.status).toBe("PRESENTE");
    expect(attendance?.registeredById).toBe(f.teacher.id);

    const movement = await prisma.ledgerMovement.findFirst({
      where: { attendanceId: result.attendanceId, type: "CLASS_USED" },
    });
    expect(movement?.delta).toBe(-1);
    expect(movement?.studentPackId).toBe(f.pack.id);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "attendance.register", entityId: result.attendanceId },
    });
    expect(audit?.userId).toBe(f.teacher.id);
  });

  it("impide el doble descuento de la misma clase (constraint único)", async () => {
    const f = await fixture();
    const input = {
      studentId: f.student.id,
      activityId: f.activity.id,
      dateYMD: todayYMD(),
      status: "PRESENTE" as const,
      userId: f.teacher.id,
      userRole: "TEACHER" as const,
    };
    await registerAttendance(input);
    await expect(registerAttendance(input)).rejects.toThrowError(
      expect.objectContaining({ code: "YA_REGISTRADA" }),
    );
    // El saldo se descontó UNA sola vez y no quedó nada a medias.
    expect(await packBalance(f.pack.id)).toBe(3);
    expect(await prisma.attendance.count()).toBe(1);
    expect(
      await prisma.ledgerMovement.count({ where: { type: "CLASS_USED" } }),
    ).toBe(1);
  });

  it("CANCELO_A_TIEMPO y CLASE_PRUEBA no consumen con la configuración predeterminada", async () => {
    const f = await fixture();
    // Fechas distintas pero del MISMO día de semana del horario.
    const r1 = await registerAttendance({
      studentId: f.student.id,
      activityId: f.activity.id,
      dateYMD: todayYMD(),
      status: "CANCELO_A_TIEMPO",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    expect(r1.consumed).toBe(false);
    const r2 = await registerAttendance({
      studentId: f.student.id,
      activityId: f.activity.id,
      dateYMD: addDaysYMD(todayYMD(), 7),
      status: "CLASE_PRUEBA",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    expect(r2.consumed).toBe(false);
    expect(await packBalance(f.pack.id)).toBe(4);
  });

  it("CANCELO_TARDE y AUSENTE sí consumen", async () => {
    const f = await fixture();
    await registerAttendance({
      studentId: f.student.id,
      activityId: f.activity.id,
      dateYMD: todayYMD(),
      status: "CANCELO_TARDE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    await registerAttendance({
      studentId: f.student.id,
      activityId: f.activity.id,
      // misma semana siguiente: mismo día de semana del horario
      dateYMD: addDaysYMD(todayYMD(), 7),
      status: "AUSENTE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    expect(await packBalance(f.pack.id)).toBe(2);
  });

  it("sin saldo: rechaza con SIN_SALDO y no crea nada", async () => {
    const admin = await makeAdmin();
    const teacher = await makeTeacher();
    const student = await makeStudent();
    const activity = await makeActivity();
    await makeEnrollment({ studentId: student.id, disciplineId: activity.disciplineId });
    await expect(
      registerAttendance({
        studentId: student.id,
        activityId: activity.id,
        dateYMD: todayYMD(),
        status: "PRESENTE",
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(DomainError);
    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.ledgerMovement.count()).toBe(0);
    void admin;
  });

  it("saldo negativo: prohibido para profesoras, permitido para admin y queda auditado", async () => {
    const admin = await makeAdmin();
    const teacher = await makeTeacher();
    const student = await makeStudent();
    const activity = await makeActivity();
    await makeEnrollment({ studentId: student.id, disciplineId: activity.disciplineId });
    const product = await makeProduct({ classCount: 1 });
    const pack = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 0, // pack sin saldo (0 acreditadas)
      createdById: admin.id,
    });

    await expect(
      registerAttendance({
        studentId: student.id,
        activityId: activity.id,
        dateYMD: todayYMD(),
        status: "PRESENTE",
        userId: teacher.id,
        userRole: "TEACHER",
        allowNegative: true,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));

    const result = await registerAttendance({
      studentId: student.id,
      activityId: activity.id,
      dateYMD: todayYMD(),
      status: "PRESENTE",
      userId: admin.id,
      userRole: "ADMIN",
      allowNegative: true,
    });
    expect(result.consumed).toBe(true);
    expect(await packBalance(pack.id)).toBe(-1);
  });

  it("elige primero el pack que vence antes (FIFO)", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const activity = await makeActivity();
    await makeEnrollment({ studentId: student.id, disciplineId: activity.disciplineId });
    const product = await makeProduct();
    const packLargo = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
      validityDays: 60,
    });
    const packCorto = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
      validityDays: 10,
    });

    const result = await registerAttendance({
      studentId: student.id,
      activityId: activity.id,
      dateYMD: todayYMD(),
      status: "PRESENTE",
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(result.packId).toBe(packCorto.id);
    expect(await packBalance(packCorto.id)).toBe(3);
    expect(await packBalance(packLargo.id)).toBe(4);
  });
});

describe("revertAttendance (reversión trazable)", () => {
  beforeEach(resetDb);

  it("marca revertida, compensa el débito y no borra nada; no permite doble reversión", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const activity = await makeActivity();
    await makeEnrollment({ studentId: student.id, disciplineId: activity.disciplineId });
    const product = await makeProduct();
    const pack = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 1,
      createdById: admin.id,
    });

    const reg = await registerAttendance({
      studentId: student.id,
      activityId: activity.id,
      dateYMD: todayYMD(),
      status: "PRESENTE",
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(await packBalance(pack.id)).toBe(0);
    // El pack quedó agotado al llegar a 0
    expect(
      (await prisma.studentPack.findUnique({ where: { id: pack.id } }))?.status,
    ).toBe("AGOTADO");

    const rev = await revertAttendance({
      attendanceId: reg.attendanceId,
      reason: "Marcada por error",
      userId: admin.id,
    });
    expect(rev.restored).toBe(true);
    expect(await packBalance(pack.id)).toBe(1);
    // Vuelve a estar disponible
    expect(
      (await prisma.studentPack.findUnique({ where: { id: pack.id } }))?.status,
    ).toBe("ACTIVO");

    // La asistencia sigue existiendo, marcada como revertida
    const attendance = await prisma.attendance.findUnique({
      where: { id: reg.attendanceId },
    });
    expect(attendance?.revertedAt).not.toBeNull();

    // El débito original sigue intacto; hay un REVERSAL nuevo
    expect(await prisma.ledgerMovement.count({ where: { type: "CLASS_USED" } })).toBe(1);
    expect(await prisma.ledgerMovement.count({ where: { type: "REVERSAL" } })).toBe(1);

    await expect(
      revertAttendance({
        attendanceId: reg.attendanceId,
        reason: "de nuevo",
        userId: admin.id,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "YA_REVERTIDA" }));
    expect(await packBalance(pack.id)).toBe(1);
  });
});
