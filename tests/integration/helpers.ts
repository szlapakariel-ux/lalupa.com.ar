import { prisma } from "@/server/db";
import { addDaysYMD, todayYMD, ymdToDate } from "@/lib/dates";

/** Limpia todas las tablas entre tests (respetando FKs con TRUNCATE CASCADE). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditEvent", "LedgerMovement", "Attendance", "Payment",
      "StudentAlert", "StudentPack", "PackProduct", "Activity",
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

export async function makeActivity(overrides: { name?: string } = {}) {
  return prisma.activity.create({
    data: {
      name: overrides.name ?? "Yoga Test",
      weekday: "LUNES",
      startTime: "18:00",
      durationMin: 60,
    },
  });
}

export async function makeProduct(
  overrides: { classCount?: number; validityDays?: number; activityId?: string | null } = {},
) {
  return prisma.packProduct.create({
    data: {
      name: `Pack x${overrides.classCount ?? 4}`,
      classCount: overrides.classCount ?? 4,
      referencePrice: 40000,
      validityDays: overrides.validityDays ?? 30,
      activityId: overrides.activityId ?? null,
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
