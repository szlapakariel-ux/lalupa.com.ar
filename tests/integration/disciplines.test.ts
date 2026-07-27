/**
 * Disciplinas, horarios, inscripciones y asistencia flexible por disciplina.
 * Cubre los escenarios funcionales aprobados: inscripción sin horario,
 * horario habitual opcional, asistencia en otro horario de la misma
 * disciplina, compatibilidad de packs por disciplina, permisos y auditoría.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { addDaysYMD, todayYMD } from "@/lib/dates";
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
import { registerAttendance, revertAttendance } from "@/server/services/attendance";
import {
  makeActivity,
  makeAdmin,
  makeDiscipline,
  makeEnrollment,
  makePackWithCredit,
  makeProduct,
  makeStudent,
  makeTeacher,
  packBalance,
  resetDb,
} from "./helpers";

const hoy = () => todayYMD();

describe("disciplinas y horarios", () => {
  beforeEach(resetDb);

  it("crea una disciplina con varios horarios; Activity.name refleja Discipline.name", async () => {
    const admin = await makeAdmin();
    const disc = await createDiscipline({
      name: "  Ilustración   y collage ",
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(disc.name).toBe("Ilustración y collage");
    expect(disc.normalizedName).toBe("ilustración y collage");

    const base = {
      disciplineId: disc.id,
      durationMin: 120,
      capacity: 8,
      userId: admin.id,
      userRole: "ADMIN" as const,
    };
    const h1 = await createSchedule({ ...base, weekday: "MIERCOLES", startTime: "18:30" });
    const h2 = await createSchedule({ ...base, weekday: "VIERNES", startTime: "18:30" });
    const h3 = await createSchedule({ ...base, weekday: "SABADO", startTime: "14:00" });

    for (const h of [h1, h2, h3]) {
      expect(h.disciplineId).toBe(disc.id);
      expect(h.name).toBe("Ilustración y collage");
    }
    expect(
      await prisma.activity.count({ where: { disciplineId: disc.id } }),
    ).toBe(3);
  });

  it("rechaza nombres normalizados duplicados, sin fusiones difusas por acentos", async () => {
    const admin = await makeAdmin();
    await createDiscipline({ name: "Cerámica", userId: admin.id, userRole: "ADMIN" });

    await expect(
      createDiscipline({ name: "  cerámica  ", userId: admin.id, userRole: "ADMIN" }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NOMBRE_DUPLICADO" }));

    // "Ceramica" (sin tilde) es OTRA disciplina a propósito: no se fusiona.
    const sinTilde = await createDiscipline({
      name: "Ceramica",
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(sinTilde.normalizedName).toBe("ceramica");
    expect(await prisma.discipline.count()).toBe(2);
  });

  it("renombrar la disciplina sincroniza el espejo Activity.name", async () => {
    const admin = await makeAdmin();
    const disc = await makeDiscipline({ name: "Yoga" });
    const act = await makeActivity({ disciplineId: disc.id, name: "Yoga" });

    await updateDiscipline({
      disciplineId: disc.id,
      name: "Yoga restaurativo",
      userId: admin.id,
      userRole: "ADMIN",
    });
    const updated = await prisma.activity.findUniqueOrThrow({ where: { id: act.id } });
    expect(updated.name).toBe("Yoga restaurativo");
  });

  it("cambiar día/hora de un horario CON asistencias crea un reemplazo y conserva el histórico", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const enrollment = await makeEnrollment({
      studentId: student.id,
      disciplineId: disc.id,
      preferredActivityId: act.id,
    });
    const product = await makeProduct();
    await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
    });
    const reg = await registerAttendance({
      studentId: student.id,
      activityId: act.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: admin.id,
      userRole: "ADMIN",
    });

    const replacement = await updateSchedule({
      activityId: act.id,
      disciplineId: disc.id,
      weekday: act.weekday,
      startTime: "20:00", // cambia la hora → reemplazo
      durationMin: 60,
      userId: admin.id,
      userRole: "ADMIN",
    });

    expect(replacement.id).not.toBe(act.id);
    const old = await prisma.activity.findUniqueOrThrow({ where: { id: act.id } });
    expect(old.active).toBe(false);
    expect(old.startTime).toBe("18:00"); // histórico intacto
    const att = await prisma.attendance.findUniqueOrThrow({
      where: { id: reg.attendanceId },
    });
    expect(att.activityId).toBe(act.id); // la asistencia no se reescribe
    // El habitual siguió al horario que "se movió".
    const e = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(e.preferredActivityId).toBe(replacement.id);
  });

  it("TEACHER no puede crear disciplinas ni horarios (server-side)", async () => {
    const teacher = await makeTeacher();
    await expect(
      createDiscipline({ name: "Telar", userId: teacher.id, userRole: "TEACHER" }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));
    const disc = await makeDiscipline();
    await expect(
      createSchedule({
        disciplineId: disc.id,
        weekday: "LUNES",
        startTime: "10:00",
        durationMin: 60,
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));
    expect(await prisma.discipline.count()).toBe(1);
    expect(await prisma.activity.count()).toBe(0);
  });
});

describe("inscripciones", () => {
  beforeEach(resetDb);

  it("inscribe sin horario habitual; no crea movimientos ni consume clases", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();

    const enrollment = await enrollStudent({
      studentId: student.id,
      disciplineId: disc.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(enrollment.preferredActivityId).toBeNull();
    expect(enrollment.active).toBe(true);
    expect(await prisma.ledgerMovement.count()).toBe(0);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "enrollment.create", entityId: enrollment.id },
    });
    expect(audit?.userId).toBe(admin.id);
  });

  it("asigna el horario habitual después, sin consumir clases", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const enrollment = await makeEnrollment({ studentId: student.id, disciplineId: disc.id });

    await setPreferredSchedule({
      enrollmentId: enrollment.id,
      activityId: act.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    const updated = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(updated.preferredActivityId).toBe(act.id);
    expect(await prisma.ledgerMovement.count()).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { action: "enrollment.preferred_schedule.assign", entityId: enrollment.id },
      }),
    ).toBe(1);
  });

  it("rechaza como habitual un horario de OTRA disciplina o inactivo", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const discA = await makeDiscipline();
    const discB = await makeDiscipline();
    const actB = await makeActivity({ disciplineId: discB.id });
    const inactiva = await makeActivity({ disciplineId: discA.id, active: false });
    const enrollment = await makeEnrollment({ studentId: student.id, disciplineId: discA.id });

    await expect(
      setPreferredSchedule({
        enrollmentId: enrollment.id,
        activityId: actB.id,
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(DomainError);
    await expect(
      setPreferredSchedule({
        enrollmentId: enrollment.id,
        activityId: inactiva.id,
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(DomainError);
  });

  it("TEACHER solo asigna horarios propios; no ajenos ni limpiar", async () => {
    const teacher = await makeTeacher();
    const otra = await makeAdmin("otra-profe@test.local");
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const propio = await makeActivity({ disciplineId: disc.id, teacherId: teacher.id });
    const ajeno = await makeActivity({
      disciplineId: disc.id,
      teacherId: otra.id,
      startTime: "20:00",
    });
    const enrollment = await makeEnrollment({ studentId: student.id, disciplineId: disc.id });

    await expect(
      setPreferredSchedule({
        enrollmentId: enrollment.id,
        activityId: ajeno.id,
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));

    await setPreferredSchedule({
      enrollmentId: enrollment.id,
      activityId: propio.id,
      userId: teacher.id,
      userRole: "TEACHER",
    });
    expect(
      (
        await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).preferredActivityId,
    ).toBe(propio.id);

    // Cambiar a OTRO horario propio de la misma disciplina: permitido.
    const propio2 = await makeActivity({
      disciplineId: disc.id,
      teacherId: teacher.id,
      startTime: "21:00",
    });
    await setPreferredSchedule({
      enrollmentId: enrollment.id,
      activityId: propio2.id,
      userId: teacher.id,
      userRole: "TEACHER",
    });

    await expect(
      setPreferredSchedule({
        enrollmentId: enrollment.id,
        activityId: null,
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));
  });

  it("desactivar/reactivar reutiliza la misma inscripción y conserva packs y asistencias", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const enrollment = await makeEnrollment({ studentId: student.id, disciplineId: disc.id });
    const product = await makeProduct();
    const pack = await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
    });
    await registerAttendance({
      studentId: student.id,
      activityId: act.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: admin.id,
      userRole: "ADMIN",
    });

    await deactivateEnrollment({
      enrollmentId: enrollment.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    // Nada se borra al desactivar.
    expect(await prisma.studentPack.count()).toBe(1);
    expect(await prisma.attendance.count()).toBe(1);
    expect(await packBalance(pack.id)).toBe(3);
    expect(await prisma.studentDisciplineEnrollment.count()).toBe(1);

    const re = await reactivateEnrollment({
      enrollmentId: enrollment.id,
      userId: admin.id,
      userRole: "ADMIN",
    });
    expect(re.id).toBe(enrollment.id);
    expect(re.active).toBe(true);
    expect(
      await prisma.auditEvent.count({ where: { action: "enrollment.deactivate" } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { action: "enrollment.reactivate" } }),
    ).toBe(1);
    // TEACHER no puede desactivar ni reactivar.
    const teacher = await makeTeacher();
    await expect(
      deactivateEnrollment({
        enrollmentId: enrollment.id,
        userId: teacher.id,
        userRole: "TEACHER",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "NO_AUTORIZADO" }));
  });
});

describe("asistencia flexible por disciplina", () => {
  beforeEach(resetDb);

  async function fixture() {
    const admin = await makeAdmin();
    const teacher = await makeTeacher();
    const student = await makeStudent();
    const disc = await makeDiscipline({ name: "Ilustración y collage" });
    const habitual = await makeActivity({ disciplineId: disc.id, startTime: "18:30" });
    const otro = await makeActivity({ disciplineId: disc.id, startTime: "20:00" });
    const enrollment = await makeEnrollment({
      studentId: student.id,
      disciplineId: disc.id,
      preferredActivityId: habitual.id,
    });
    return { admin, teacher, student, disc, habitual, otro, enrollment };
  }

  it("registra en el horario habitual y consume EXACTAMENTE una clase", async () => {
    const f = await fixture();
    const product = await makeProduct(); // genérico
    const pack = await makePackWithCredit({
      studentId: f.student.id,
      productId: product.id,
      classCount: 4,
      createdById: f.admin.id,
    });
    const r = await registerAttendance({
      studentId: f.student.id,
      activityId: f.habitual.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    expect(r.consumed).toBe(true);
    const debits = await prisma.ledgerMovement.findMany({
      where: { type: "CLASS_USED", attendanceId: r.attendanceId },
    });
    expect(debits).toHaveLength(1);
    expect(debits[0].delta).toBe(-1);
    expect(await packBalance(pack.id)).toBe(3);
  });

  it("permite otro horario de la misma disciplina SIN cambiar el habitual y registrando el horario real", async () => {
    const f = await fixture();
    const product = await makeProduct({ disciplineId: f.disc.id }); // pack de la disciplina
    await makePackWithCredit({
      studentId: f.student.id,
      productId: product.id,
      classCount: 4,
      createdById: f.admin.id,
    });

    const r = await registerAttendance({
      studentId: f.student.id,
      activityId: f.otro.id, // horario excepcional
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    expect(r.consumed).toBe(true);

    const att = await prisma.attendance.findUniqueOrThrow({
      where: { id: r.attendanceId },
    });
    expect(att.activityId).toBe(f.otro.id); // horario REAL

    // El horario habitual NO cambió.
    const e = await prisma.studentDisciplineEnrollment.findUniqueOrThrow({
      where: { id: f.enrollment.id },
    });
    expect(e.preferredActivityId).toBe(f.habitual.id);
  });

  it("bloquea un pack de OTRA disciplina (y permite el de la misma o el genérico)", async () => {
    const f = await fixture();
    const otraDisc = await makeDiscipline({ name: "Cerámica" });
    const productoAjeno = await makeProduct({ disciplineId: otraDisc.id });
    await makePackWithCredit({
      studentId: f.student.id,
      productId: productoAjeno.id,
      classCount: 4,
      createdById: f.admin.id,
    });

    // Solo tiene pack de otra disciplina → SIN_SALDO, no se crea nada.
    await expect(
      registerAttendance({
        studentId: f.student.id,
        activityId: f.habitual.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: f.admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SIN_SALDO" }));
    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.ledgerMovement.count({ where: { type: "CLASS_USED" } })).toBe(0);
  });

  it("bloquea a una alumna sin inscripción activa (sin inscripción o desactivada)", async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const disc = await makeDiscipline();
    const act = await makeActivity({ disciplineId: disc.id });
    const product = await makeProduct();
    await makePackWithCredit({
      studentId: student.id,
      productId: product.id,
      classCount: 4,
      createdById: admin.id,
    });

    await expect(
      registerAttendance({
        studentId: student.id,
        activityId: act.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SIN_INSCRIPCION" }));

    await makeEnrollment({ studentId: student.id, disciplineId: disc.id, active: false });
    await expect(
      registerAttendance({
        studentId: student.id,
        activityId: act.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SIN_INSCRIPCION" }));
    expect(await prisma.attendance.count()).toBe(0);
  });

  it("bloquea registrar con un horario de OTRA disciplina distinta a la inscripta", async () => {
    const f = await fixture();
    const otraDisc = await makeDiscipline({ name: "Cerámica" });
    const horarioAjeno = await makeActivity({ disciplineId: otraDisc.id });
    const product = await makeProduct();
    await makePackWithCredit({
      studentId: f.student.id,
      productId: product.id,
      classCount: 4,
      createdById: f.admin.id,
    });

    await expect(
      registerAttendance({
        studentId: f.student.id,
        activityId: horarioAjeno.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: f.admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SIN_INSCRIPCION" }));
  });

  it("bloquea una fecha cuyo día no coincide con el del horario, con mensaje claro", async () => {
    const f = await fixture();
    const product = await makeProduct();
    await makePackWithCredit({
      studentId: f.student.id,
      productId: product.id,
      classCount: 4,
      createdById: f.admin.id,
    });

    const manana = addDaysYMD(hoy(), 1); // otro día de la semana
    let error: unknown;
    try {
      await registerAttendance({
        studentId: f.student.id,
        activityId: f.habitual.id,
        dateYMD: manana,
        status: "PRESENTE",
        userId: f.admin.id,
        userRole: "ADMIN",
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("FECHA_NO_COINCIDE");
    expect((error as DomainError).message).toMatch(/corresponde a .*Elegí una fecha de/);
    expect(await prisma.attendance.count()).toBe(0);
  });

  it("bloquea la doble asistencia (misma alumna, horario y fecha) y la reversión es compensatoria", async () => {
    const f = await fixture();
    const product = await makeProduct();
    const pack = await makePackWithCredit({
      studentId: f.student.id,
      productId: product.id,
      classCount: 4,
      createdById: f.admin.id,
    });
    const r = await registerAttendance({
      studentId: f.student.id,
      activityId: f.habitual.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    await expect(
      registerAttendance({
        studentId: f.student.id,
        activityId: f.habitual.id,
        dateYMD: hoy(),
        status: "PRESENTE",
        userId: f.admin.id,
        userRole: "ADMIN",
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "YA_REGISTRADA" }));

    await revertAttendance({
      attendanceId: r.attendanceId,
      reason: "Marcada por error",
      userId: f.admin.id,
    });
    expect(await packBalance(pack.id)).toBe(4);
    // El débito original sigue; la reversión es una fila nueva.
    expect(
      await prisma.ledgerMovement.count({ where: { attendanceId: r.attendanceId } }),
    ).toBe(2);
  });

  it("una asistencia excepcional NO altera el horario habitual (queda igual después)", async () => {
    const f = await fixture();
    const product = await makeProduct();
    await makePackWithCredit({
      studentId: f.student.id,
      productId: product.id,
      classCount: 4,
      createdById: f.admin.id,
    });
    await registerAttendance({
      studentId: f.student.id,
      activityId: f.otro.id,
      dateYMD: hoy(),
      status: "PRESENTE",
      userId: f.teacher.id,
      userRole: "TEACHER",
    });
    // Cambiar el habitual DESPUÉS tampoco toca la asistencia ya registrada.
    await setPreferredSchedule({
      enrollmentId: f.enrollment.id,
      activityId: f.otro.id,
      userId: f.admin.id,
      userRole: "ADMIN",
    });
    const att = await prisma.attendance.findFirstOrThrow();
    expect(att.activityId).toBe(f.otro.id);
    expect(
      await prisma.auditEvent.count({
        where: { action: "enrollment.preferred_schedule.change" },
      }),
    ).toBe(1);
  });
});
