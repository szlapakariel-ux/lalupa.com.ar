import { Prisma, type Role, type StudentStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { dateToYMD, todayYMD } from "@/lib/dates";
import { sumBalance } from "@/lib/policy";
import { alertVisibilityFilter } from "@/server/services/students";

/** Resumen de una alumna para listados: saldos, pack vigente, pago, alertas. */
export interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: StudentStatus;
  /** Pack "principal": el vigente que vence antes; si no hay, el último. */
  currentPackName: string | null;
  currentPackStatus: string | null;
  currentPackExpiresYMD: string | null;
  purchased: number;
  used: number;
  available: number;
  paymentStatus: string | null;
  hasAlerts: boolean;
  lastAttendanceYMD: string | null;
}

const studentWithRelations = Prisma.validator<Prisma.StudentDefaultArgs>()({
  include: {
    packs: {
      include: {
        product: { select: { name: true } },
        ledger: { select: { delta: true, type: true } },
        payments: { select: { status: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
      },
    },
    alerts: { where: { active: true }, select: { id: true, visibility: true } },
    attendances: {
      where: { revertedAt: null },
      orderBy: { date: "desc" as const },
      take: 1,
      select: { date: true },
    },
  },
});

type StudentWithRelations = Prisma.StudentGetPayload<typeof studentWithRelations>;

export function summarizeStudent(s: StudentWithRelations, role: Role): StudentSummary {
  const today = todayYMD();
  const vigentes = s.packs.filter(
    (p) => p.status === "ACTIVO" && dateToYMD(p.expiresAt) >= today,
  );
  const current =
    [...vigentes].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0] ??
    [...s.packs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
    null;

  const purchased = s.packs.reduce(
    (acc, p) =>
      acc + p.ledger.filter((m) => m.delta > 0).reduce((a, m) => a + m.delta, 0),
    0,
  );
  const used = s.packs.reduce(
    (acc, p) =>
      acc +
      p.ledger
        .filter((m) => m.type === "CLASS_USED")
        .reduce((a, m) => a + Math.abs(m.delta), 0),
    0,
  );
  const available = vigentes.reduce((acc, p) => acc + sumBalance(p.ledger), 0);

  const visibleAlerts =
    role === "ADMIN" ? s.alerts : s.alerts.filter((a) => a.visibility === "TODOS");

  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    phone: s.phone,
    status: s.status,
    currentPackName: current?.product.name ?? null,
    currentPackStatus: current?.status ?? null,
    currentPackExpiresYMD: current ? dateToYMD(current.expiresAt) : null,
    purchased,
    used,
    available,
    paymentStatus: current?.payments[0]?.status ?? null,
    hasAlerts: visibleAlerts.length > 0,
    lastAttendanceYMD: s.attendances[0] ? dateToYMD(s.attendances[0].date) : null,
  };
}

export interface StudentListParams {
  q?: string;
  status?: StudentStatus | "TODAS";
  role: Role;
}

export async function listStudents({ q, status, role }: StudentListParams) {
  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...(status && status !== "TODAS" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const students = await prisma.student.findMany({
    where,
    ...studentWithRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
  return students.map((s) => summarizeStudent(s, role));
}

/** Ficha completa de una alumna (histories incluidas), filtrada por rol. */
export async function getStudentDetail(studentId: string, role: Role) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      packs: {
        include: {
          product: { select: { name: true, activityId: true } },
          ledger: { select: { delta: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      alerts: {
        where: { ...alertVisibilityFilter(role) },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      },
      attendances: {
        include: {
          activity: { select: { name: true } },
          registeredBy: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        take: 50,
      },
      payments: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 50,
      },
    },
  });
  if (!student) return null;

  const ledger = await prisma.ledgerMovement.findMany({
    where: { studentId },
    include: {
      studentPack: { include: { product: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const auditEvents =
    role === "ADMIN"
      ? await prisma.auditEvent.findMany({
          where: {
            OR: [
              { entity: "Student", entityId: studentId },
              { metadata: { path: ["studentId"], equals: studentId } },
            ],
          },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];

  return { student, ledger, auditEvents };
}
