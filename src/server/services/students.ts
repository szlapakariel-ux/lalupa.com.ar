import type {
  AlertType,
  AlertVisibility,
  Role,
  StudentStatus,
} from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { audit } from "./audit";

export interface StudentData {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  status?: StudentStatus;
}

export async function createStudent(
  data: StudentData,
  actor: { userId: string; userRole: Role; ip?: string },
) {
  if (actor.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden crear alumnas.");
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({ data });
    await audit(tx, {
      userId: actor.userId,
      action: "student.create",
      entity: "Student",
      entityId: student.id,
      metadata: { name: `${data.lastName}, ${data.firstName}` },
      ip: actor.ip,
    });
    return student;
  });
}

export async function updateStudent(
  studentId: string,
  data: StudentData,
  actor: { userId: string; userRole: Role; ip?: string },
) {
  if (actor.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden editar alumnas.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!existing) throw new DomainError("NO_ENCONTRADO", "Alumna inexistente.");
    const student = await tx.student.update({ where: { id: studentId }, data });
    await audit(tx, {
      userId: actor.userId,
      action: "student.update",
      entity: "Student",
      entityId: studentId,
      metadata: {
        name: `${student.lastName}, ${student.firstName}`,
        statusChanged: existing.status !== student.status,
        from: existing.status,
        to: student.status,
      },
      ip: actor.ip,
    });
    return student;
  });
}

export interface AlertData {
  type: AlertType;
  title: string;
  instruction?: string;
  visibility: AlertVisibility;
}

/**
 * Alertas: información mínima operativa (no historia clínica).
 * El contenido NUNCA se incluye en auditoría ni logs — solo el tipo.
 */
export async function createAlert(
  studentId: string,
  data: AlertData,
  actor: { userId: string; userRole: Role; ip?: string },
) {
  if (actor.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden cargar alertas.");
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new DomainError("NO_ENCONTRADO", "Alumna inexistente.");
    const alert = await tx.studentAlert.create({
      data: { studentId, ...data, createdById: actor.userId },
    });
    await audit(tx, {
      userId: actor.userId,
      action: "alert.create",
      entity: "StudentAlert",
      entityId: alert.id,
      // Solo el tipo: jamás el contenido de la alerta.
      metadata: { studentId, type: data.type, visibility: data.visibility },
      ip: actor.ip,
    });
    return alert;
  });
}

export async function updateAlert(
  alertId: string,
  data: Partial<AlertData> & { active?: boolean },
  actor: { userId: string; userRole: Role; ip?: string },
) {
  if (actor.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden editar alertas.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.studentAlert.findUnique({ where: { id: alertId } });
    if (!existing) throw new DomainError("NO_ENCONTRADO", "Alerta inexistente.");
    const alert = await tx.studentAlert.update({ where: { id: alertId }, data });
    await audit(tx, {
      userId: actor.userId,
      action: "alert.update",
      entity: "StudentAlert",
      entityId: alertId,
      metadata: {
        studentId: existing.studentId,
        type: alert.type,
        active: alert.active,
        visibility: alert.visibility,
      },
      ip: actor.ip,
    });
    return alert;
  });
}

/** Alertas visibles para el rol dado (SOLO_ADMIN queda oculta a profesoras). */
export function alertVisibilityFilter(role: Role) {
  return role === "ADMIN" ? {} : { visibility: "TODOS" as AlertVisibility };
}
