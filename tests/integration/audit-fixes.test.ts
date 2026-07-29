/**
 * Correcciones de la auditoría técnica del modelo de disciplinas:
 *
 *  H1. allowNegative solo puede debitar packs COMPATIBLES (genéricos o de
 *      la disciplina de la clase); nunca un pack específico de otra.
 *  H2. Discipline.active protegido server-side: asistencia, horario
 *      habitual, creación/activación de horarios.
 *  H3. preferredActivityId nunca queda apuntando a un horario inactivo:
 *      se limpia al desactivar, se mueve solo a reemplazos activos y se
 *      revalida al reactivar inscripciones.
 *  Menor A: createDiscipline respeta y audita "active".
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { todayYMD } from "@/lib/dates";
import { registerAttendance } from "@/server/services/attendance";
import {
  createDiscipline,
  createSchedule,
  updateDiscipline,
  updateSchedule,
} from "@/server/services/disciplines";
import {
  deactivateEnrollment,
  enrollStudent,
  reactivateEnrollment,
  setPreferredSchedule,
} from "@/server/services/enrollments";
import {
  makeActivity,
  makeAdmin,
  makeDiscipline,
  makeEnrollment,
  makePackWithCredit,
  makeProduct,
  makeStudent,
  packBalance,
  resetDb,
} from "./helpers";

const hoy = () => todayYMD();

describe("H1: saldo negativo restringido a packs compatibles", () => {
  beforeEach(resetDb);

  async function base() {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const ceramica = await makeDiscipline({ name: "Cerámica" });
    const yoga = await makeDiscipline({ name: "Yoga" });
    const claseCeramica = await makeActivity({ disciplineId: ceramica.id });
    await makeEnrollment({ studentId: student.id, disciplineId: ceramica.id });
    return { admin, student, ceramica, yoga, claseCeramica };
  }

  it("pack exclusivo de Yoga + clase de Cerámica + allowNegative: falla sin tocar nada", async () => {
    const f = await base();
    const productoYoga = await makeProduct({ disciplineId: f.yoga.id });
    const packYoga = await makePackWithCredit({
      studentId: f.student.id,
      productId: productoYoga.id,
      classCount: 4,
      createdById: f.admin.id,
    });

    await expect(
      registerAttendance({
        studentId: f.student.id,
        activityId: f.claseCeramica.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: f.admin.id,
        userRole: "ADMIN",
        allowNegative: true,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SIN_SALDO" }));

    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.ledgerMovement.count({ where: { type: "CLASS_USED" } })).toBe(0);
    expect(await packBalance(packYoga.id)).toBe(4); // intacto
    const pack = await prisma.studentPack.findUniqueOrThrow({ where: { id: packYoga.id } });
    expect(pack.status).toBe("ACTIVO"); // sin modificaciones
  });

  it("pack GENÉRICO sin saldo + allowNegative: registra y descuenta exactamente una", async () => {
    const f = await base();
    const generico = await makeProduct(); // disciplineId null
    const pack = await makePackWithCredit({
      studentId: f.student.id,
      productId: generico.id,
      classCount: 0, // sin saldo
      createdById: f.admin.id,
    });

    const r = await registerAttendance({
      studentId: f.student.id,
      activityId: f.claseCeramica.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: f.admin.id,
      userRole: "ADMIN",
      allowNegative: true,
    });
    expect(r.consumed).toBe(true);
    expect(r.packId).toBe(pack.id);
    expect(await packBalance(pack.id)).toBe(-1);
    expect(
      await prisma.ledgerMovement.count({ where: { type: "CLASS_USED" } }),
    ).toBe(1);
  });

  it("pack de la MISMA disciplina sin saldo + allowNegative: registra y descuenta exactamente una", async () => {
    const f = await base();
    const propio = await makeProduct({ disciplineId: f.ceramica.id });
    const pack = await makePackWithCredit({
      studentId: f.student.id,
      productId: propio.id,
      classCount: 0,
      createdById: f.admin.id,
    });

    const r = await registerAttendance({
      studentId: f.student.id,
      activityId: f.claseCeramica.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: f.admin.id,
      userRole: "ADMIN",
      allowNegative: true,
    });
    expect(r.consumed).toBe(true);
    expect(r.packId).toBe(pack.id);
    expect(await packBalance(pack.id)).toBe(-1);
  });
});

describe("H2: disciplina inactiva protegida server-side", () => {
  beforeEach(resetDb);

  it("bloquea la asistencia aunque el horario esté activo, sin crear nada", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    await makeEnrollment({ studentId: student.id, disciplineId: disc.id });
    const product = await makeProduct();
    await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
    });
    await prisma.discipline.update({ where: { id: disc.id }, data: { active: false } });

    await expect(
      registerAttendance({
        studentId: student.id,
        activityId: act.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DATO_INVALIDO" }));

    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.ledgerMovement.count({ where: { type: "CLASS_USED" } })).toBe(0);
    // Ninguna auditoría exitosa del registro rechazado.
    expect(
      await prisma.auditEvent.count({ where: { action: "attendance.register" } }),
    ).toBe(0);
  });

  it("bloquea asignar o cambiar el horario habitual", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const enrollment = await makeEnrollment({ studentId: student.id, disciplineId: disc.id });
    await prisma.discipline.update({ where: { id: disc.id }, data: { active: false } });

    await expect(
      setPreferredSchedule({
        enrollmentId: enrollment.id,
        activityId: act.id,
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DATO_INVALIDO" }));
    const after = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(after.preferredActivityId).toBeNull(); // sin cambios
    expect(
      await prisma.auditEvent.count({
        where: { action: { startsWith: "enrollment.preferred_schedule" } },
      }),
    ).toBe(0);
  });

  it("bloquea crear horarios y (re)activar horarios en una disciplina inactiva", async () => {
    const admin = await makeAdmin();
    const disc = await makeDiscipline({ active: false });

    await expect(
      createSchedule({
        disciplineId: disc.id,
        weekday: "LUNES",
        startTime: "10:00",
        durationMin: 60,
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DATO_INVALIDO" }));
    expect(await prisma.activity.count()).toBe(0);

    // Horario preexistente desactivado no puede reactivarse mientras la
    // disciplina siga inactiva.
    const disc2 = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc2.id, active: false });
    await prisma.discipline.update({ where: { id: disc2.id }, data: { active: false } });
    await expect(
      updateSchedule({
        activityId: act.id,
        disciplineId: disc2.id,
        weekday: act.weekday,
        startTime: act.startTime,
        durationMin: 60,
        active: true,
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DATO_INVALIDO" }));
    expect(
      (await prisma.activity.findUniqueOrThrow({ where: { id: act.id } })).active,
    ).toBe(false);
    expect(await prisma.ledgerMovement.count()).toBe(0);
  });
});

describe("H3: horarios habituales nunca quedan apuntando a horarios inactivos", () => {
  beforeEach(resetDb);

  async function conHabitual(opts: { conHistorial?: boolean } = {}) {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const enrollment = await makeEnrollment({
      studentId: student.id,
      disciplineId: disc.id,
      preferredActivityId: act.id,
    });
    let attendanceId: string | null = null;
    if (opts.conHistorial) {
      const product = await makeProduct();
      await makePackWithCredit({
        studentId: student.id,
        productId: product.id,
        classCount: 4,
        createdById: admin.id,
      });
      const r = await registerAttendance({
        studentId: student.id,
        activityId: act.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: admin.id,
        userRole: "ADMIN",
      });
      attendanceId = r.attendanceId;
    }
    return { admin, student, disc, act, enrollment, attendanceId };
  }

  it("desactivar un horario SIN historial deja los habituales pendientes (misma transacción)", async () => {
    const f = await conHabitual();
    await updateSchedule({
      activityId: f.act.id,
      disciplineId: f.disc.id,
      weekday: f.act.weekday,
      startTime: f.act.startTime,
      durationMin: 60,
      active: false,
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    const e = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: f.enrollment.id },
    });
    expect(e.preferredActivityId).toBeNull();
    expect(e.active).toBe(true); // la inscripción sigue activa
    expect(await prisma.ledgerMovement.count()).toBe(0);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "schedule.deactivate", entityId: f.act.id },
    });
    expect((audit.metadata as { clearedPreferred?: number }).clearedPreferred).toBe(1);
  });

  it("desactivar un horario CON historial (sin cambiar día/hora) limpia habituales y conserva asistencias", async () => {
    const f = await conHabitual({ conHistorial: true });
    const ledgerAntes = await prisma.ledgerMovement.count();

    await updateSchedule({
      activityId: f.act.id,
      disciplineId: f.disc.id,
      weekday: f.act.weekday,
      startTime: f.act.startTime,
      durationMin: 60,
      active: false,
      userId: f.admin.id,
      userRole: "ADMIN",
    });

    const e = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: f.enrollment.id },
    });
    expect(e.preferredActivityId).toBeNull();
    const att = await prisma.attendance.findUniqueOrThrow({
      where: { id: f.attendanceId! },
    });
    expect(att.activityId).toBe(f.act.id); // histórico intacto
    expect(await prisma.ledgerMovement.count()).toBe(ledgerAntes); // sin movimientos
  });

  it("reemplazo ACTIVO por cambio de día/hora mueve los habituales", async () => {
    const f = await conHabitual({ conHistorial: true });
    const replacement = await updateSchedule({
      activityId: f.act.id,
      disciplineId: f.disc.id,
      weekday: f.act.weekday,
      startTime: "21:30",
      durationMin: 60,
      active: true,
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    const e = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: f.enrollment.id },
    });
    expect(e.preferredActivityId).toBe(replacement.id);
  });

  it("reemplazo INACTIVO por cambio de día/hora deja los habituales pendientes", async () => {
    const f = await conHabitual({ conHistorial: true });
    const ledgerAntes = await prisma.ledgerMovement.count();
    const replacement = await updateSchedule({
      activityId: f.act.id,
      disciplineId: f.disc.id,
      weekday: f.act.weekday,
      startTime: "21:30",
      durationMin: 60,
      active: false,
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    expect(replacement.active).toBe(false);
    const e = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: f.enrollment.id },
    });
    expect(e.preferredActivityId).toBeNull(); // no apunta al reemplazo inactivo
    const att = await prisma.attendance.findUniqueOrThrow({
      where: { id: f.attendanceId! },
    });
    expect(att.activityId).toBe(f.act.id); // asistencia histórica intacta
    expect(await prisma.ledgerMovement.count()).toBe(ledgerAntes);
  });

  it("reactivar una inscripción con habitual obsoleto la deja pendiente (vía reactivateEnrollment y vía enrollStudent)", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const enrollment = await makeEnrollment({
      studentId: student.id,
      disciplineId: disc.id,
      preferredActivityId: act.id,
    });
    await deactivateEnrollment({
      enrollmentId: enrollment.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    // Mientras estaba inactiva, la disciplina se desactiva (el habitual
    // guardado queda obsoleto sin que el updateMany lo haya limpiado).
    await updateDiscipline({
      disciplineId: disc.id,
      name: disc.name,
      active: false,
      userId: admin.id,
      userRole: "ADMIN",
    });

    const re = await reactivateEnrollment({
      enrollmentId: enrollment.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(re.active).toBe(true);
    expect(re.preferredActivityId).toBeNull();

    // Mismo criterio si la reactivación entra por enrollStudent (reuso):
    await deactivateEnrollment({
      enrollmentId: enrollment.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    await prisma.studentDisciplineEnrollment.update({
      where: { id: enrollment.id },
      data: { preferredActivityId: act.id },
    });
    await prisma.activity.update({ where: { id: act.id }, data: { active: false } });
    await updateDiscipline({
      disciplineId: disc.id,
      name: disc.name,
      active: true,
      userId: admin.id,
      userRole: "ADMIN",
    });
    const re2 = await enrollStudent({
      studentId: student.id,
      disciplineId: disc.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(re2.id).toBe(enrollment.id);
    expect(re2.preferredActivityId).toBeNull(); // horario inactivo => pendiente
  });
});

describe("Menor A: createDiscipline respeta y audita active", () => {
  beforeEach(resetDb);

  it("crear con active=false queda inactiva y auditada con ese valor", async () => {
    const admin = await makeAdmin();
    const disc = await createDiscipline({
      name: "Telar",
      active: false,
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(disc.active).toBe(false);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "discipline.create", entityId: disc.id },
    });
    expect((audit.metadata as { active?: boolean }).active).toBe(false);
  });
});
