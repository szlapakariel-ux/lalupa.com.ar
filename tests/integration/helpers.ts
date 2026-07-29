import type { Weekday } from "@prisma/client";
import { prisma } from "@/server/db";
import { addDaysYMD, todayYMD, weekdayOfYMD, ymdToDate } from "@/lib/dates";

/** Limpia todas las tablas entre tests (respetando FKs con TRUNCATE CASCADE). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditEvent", "LedgerMovement", "Attendance", "Payment",
      "StudentAlert", "StudentPack", "PackProduct",
      "StudentDisciplineEnrollment", "Activity", "Discipline",
      "Student", "LoginAttempt", "Session", "Settings", "User"
    CASCADE
  `);
}

export async function makeAdmin(email = "admin@test.local") {
  return prisma.user.create({
    data: { email, name: "Admin Test", passwordHash: "x", role: "ADMIN" },
  });
}

export async function makeTeacher(email = "profe@test.local") {
  return prisma.user.create({
    data: { email, name: "Profe Test", passwordHash: "x", role: "TEACHER" },
  });
}

export async function makeStudent(overrides: { firstName?: string; lastName?: string } = {}) {
  return prisma.student.create({
    data: {
      firstName: overrides.firstName ?? "Alumna",
      lastName: overrides.lastName ?? "Test",
    },
  });
}

let disciplineSeq = 0;

export async function makeDiscipline(overrides: { name?: string; active?: boolean } = {}) {
  const name = overrides.name ?? `Disciplina Test ${++disciplineSeq}`;
  return prisma.discipline.create({
    data: {
      name,
      normalizedName: name.trim().replace(/\s+/g, " ").toLowerCase(),
      active: overrides.active ?? true,
    },
  });
}

/**
 * Horario de prueba. Por defecto cae en el día de la semana de HOY para que
 * registerAttendance con todayYMD() pase la validación de fecha.
 */
export async function makeActivity(
  overrides: {
    name?: string;
    disciplineId?: string;
    weekday?: Weekday;
    startTime?: string;
    teacherId?: string | null;
    active?: boolean;
  } = {},
) {
  const disciplineId =
    overrides.disciplineId ?? (await makeDiscipline({ name: overrides.name })).id;
  return prisma.activity.create({
    data: {
      name: overrides.name ?? "Horario Test",
      disciplineId,
      weekday: overrides.weekday ?? weekdayOfYMD(todayYMD()),
      startTime: overrides.startTime ?? "18:00",
      durationMin: 60,
      teacherId: overrides.teacherId ?? null,
      active: overrides.active ?? true,
    },
  });
}

/** Inscripción activa de la alumna en la disciplina (no consume clases). */
export async function makeEnrollment(input: {
  studentId: string;
  disciplineId: string;
  preferredActivityId?: string | null;
  active?: boolean;
}) {
  return prisma.studentDisciplineEnrollment.create({
    data: {
      studentId: input.studentId,
      disciplineId: input.disciplineId,
      preferredActivityId: input.preferredActivityId ?? null,
      active: input.active ?? true,
    },
  });
}

export async function makeProduct(
  overrides: {
    name?: string;
    classCount?: number;
    validityDays?: number;
    disciplineId?: string | null;
  } = {},
) {
  return prisma.packProduct.create({
    data: {
      name: overrides.name ?? `Pack x${overrides.classCount ?? 4}`,
      classCount: overrides.classCount ?? 4,
      referencePrice: 40000,
      validityDays: overrides.validityDays ?? 30,
      disciplineId: overrides.disciplineId ?? null,
    },
  });
}

/** Pack con su acreditación inicial en el libro (como hace assignPack). */
export async function makePackWithCredit(input: {
  studentId: string;
  productId: string;
  classCount: number;
  createdById: string;
  startYMD?: string;
  validityDays?: number;
}) {
  const start = input.startYMD ?? todayYMD();
  const pack = await prisma.studentPack.create({
    data: {
      studentId: input.studentId,
      productId: input.productId,
      classCount: input.classCount,
      agreedPrice: 40000,
      startDate: ymdToDate(start),
      expiresAt: ymdToDate(addDaysYMD(start, input.validityDays ?? 30)),
      createdById: input.createdById,
    },
  });
  await prisma.ledgerMovement.create({
    data: {
      studentId: input.studentId,
      studentPackId: pack.id,
      type: "PACK_PURCHASE",
      delta: input.classCount,
      createdById: input.createdById,
    },
  });
  return pack;
}

export async function packBalance(studentPackId: string) {
  const agg = await prisma.ledgerMovement.aggregate({
    where: { studentPackId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}
