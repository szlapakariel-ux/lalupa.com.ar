import type { Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { audit } from "./audit";

/**
 * Inscripciones de alumnas en disciplinas.
 *
 * Reglas:
 *  - crear, desactivar y reactivar inscripciones: solo ADMIN;
 *  - asignar/cambiar el horario habitual: ADMIN sobre cualquier horario
 *    activo de la disciplina; TEACHER solo sobre SUS PROPIOS horarios
 *    activos de esa disciplina (validado server-side);
 *  - quitar el horario habitual (dejarlo pendiente): solo ADMIN;
 *  - ninguna de estas operaciones consume clases, crea movimientos de
 *    ledger ni modifica asistencias históricas;
 *  - desactivar una inscripción no borra packs, movimientos ni asistencias;
 *  - reactivar reutiliza la MISMA inscripción (unique studentId+disciplineId).
 */

export interface EnrollInput {
  studentId: string;
  disciplineId: string;
  userId: string;
  userRole: Role;
  ip?: string;
}

function requireAdmin(role: Role, message: string) {
  if (role !== "ADMIN") throw new DomainError("NO_AUTORIZADO", message);
}

export async function enrollStudent(input: EnrollInput) {
  requireAdmin(input.userRole, "Solo administradoras pueden inscribir alumnas.");
  return prisma.$transaction(async (tx) => {
    const [student, discipline] = await Promise.all([
      tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null },
        select: { id: true },
      }),
      tx.discipline.findFirst({
        where: { id: input.disciplineId, active: true },
        select: { id: true, name: true },
      }),
    ]);
    if (!student) throw new DomainError("NO_ENCONTRADO", "Alumna inexistente.");
    if (!discipline) throw new DomainError("NO_ENCONTRADO", "Disciplina inexistente o inactiva.");

    const existing = await tx.studentDisciplineEnrollment.findUnique({
      where: {
        studentId_disciplineId: {
          studentId: input.studentId,
          disciplineId: input.disciplineId,
        },
      },
    });

    if (existing?.active) {
      throw new DomainError("DATO_INVALIDO", "La alumna ya está inscripta en esa disciplina.");
    }

    if (existing) {
      // Reactivación: se reutiliza la misma inscripción.
      const reactivated = await tx.studentDisciplineEnrollment.update({
        where: { id: existing.id },
        data: { active: true },
      });
      await audit(tx, {
        userId: input.userId,
        action: "enrollment.reactivate",
        entity: "StudentDisciplineEnrollment",
        entityId: existing.id,
        metadata: { studentId: input.studentId, disciplineId: input.disciplineId },
        ip: input.ip,
      });
      return reactivated;
    }

    const enrollment = await tx.studentDisciplineEnrollment.create({
      data: { studentId: input.studentId, disciplineId: input.disciplineId },
    });
    await audit(tx, {
      userId: input.userId,
      action: "enrollment.create",
      entity: "StudentDisciplineEnrollment",
      entityId: enrollment.id,
      metadata: { studentId: input.studentId, disciplineId: input.disciplineId },
      ip: input.ip,
    });
    return enrollment;
  });
}

export interface PreferredScheduleInput {
  enrollmentId: string;
  /** null = dejar el horario habitual pendiente (solo ADMIN). */
  activityId: string | null;
  userId: string;
  userRole: Role;
  ip?: string;
}

/**
 * Asigna o cambia el horario habitual. NO consume clases, NO toca
 * asistencias históricas ni packs.
 */
export async function setPreferredSchedule(input: PreferredScheduleInput) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentDisciplineEnrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { discipline: { select: { id: true, name: true } } },
    });
    if (!enrollment) throw new DomainError("NO_ENCONTRADO", "Inscripción inexistente.");
    if (!enrollment.active) {
      throw new DomainError("DATO_INVALIDO", "La inscripción está desactivada.");
    }

    if (input.activityId === null) {
      requireAdmin(
        input.userRole,
        "Solo administradoras pueden dejar el horario habitual pendiente.",
      );
    } else {
      const activity = await tx.activity.findUnique({
        where: { id: input.activityId },
        select: { id: true, disciplineId: true, active: true, teacherId: true },
      });
      if (!activity) throw new DomainError("NO_ENCONTRADO", "Horario inexistente.");
      if (activity.disciplineId !== enrollment.disciplineId) {
        throw new DomainError(
          "DATO_INVALIDO",
          "El horario pertenece a otra disciplina.",
        );
      }
      if (!activity.active) {
        throw new DomainError("DATO_INVALIDO", "El horario está desactivado.");
      }
      // Una profesora solo puede asignar horarios PROPIOS.
      if (input.userRole !== "ADMIN" && activity.teacherId !== input.userId) {
        throw new DomainError(
          "NO_AUTORIZADO",
          "Solo podés asignar horarios propios como habituales.",
        );
      }
    }

    const before = enrollment.preferredActivityId;
    if (before === input.activityId) return enrollment;

    const updated = await tx.studentDisciplineEnrollment.update({
      where: { id: enrollment.id },
      data: { preferredActivityId: input.activityId },
    });

    await audit(tx, {
      userId: input.userId,
      action:
        before === null
          ? "enrollment.preferred_schedule.assign"
          : "enrollment.preferred_schedule.change",
      entity: "StudentDisciplineEnrollment",
      entityId: enrollment.id,
      metadata: {
        studentId: enrollment.studentId,
        disciplineId: enrollment.disciplineId,
        from: before,
        to: input.activityId,
      },
      ip: input.ip,
    });
    return updated;
  });
}

export interface EnrollmentToggleInput {
  enrollmentId: string;
  userId: string;
  userRole: Role;
  ip?: string;
}

/** Desactiva la inscripción. No borra packs, movimientos ni asistencias. */
export async function deactivateEnrollment(input: EnrollmentToggleInput) {
  requireAdmin(input.userRole, "Solo administradoras pueden desactivar inscripciones.");
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentDisciplineEnrollment.findUnique({
      where: { id: input.enrollmentId },
    });
    if (!enrollment) throw new DomainError("NO_ENCONTRADO", "Inscripción inexistente.");
    if (!enrollment.active) return enrollment;

    const updated = await tx.studentDisciplineEnrollment.update({
      where: { id: enrollment.id },
      data: { active: false },
    });
    await audit(tx, {
      userId: input.userId,
      action: "enrollment.deactivate",
      entity: "StudentDisciplineEnrollment",
      entityId: enrollment.id,
      metadata: { studentId: enrollment.studentId, disciplineId: enrollment.disciplineId },
      ip: input.ip,
    });
    return updated;
  });
}

/** Reactiva una inscripción existente (misma fila, mismo id). */
export async function reactivateEnrollment(input: EnrollmentToggleInput) {
  requireAdmin(input.userRole, "Solo administradoras pueden reactivar inscripciones.");
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentDisciplineEnrollment.findUnique({
      where: { id: input.enrollmentId },
    });
    if (!enrollment) throw new DomainError("NO_ENCONTRADO", "Inscripción inexistente.");
    if (enrollment.active) return enrollment;

    const updated = await tx.studentDisciplineEnrollment.update({
      where: { id: enrollment.id },
      data: { active: true },
    });
    await audit(tx, {
      userId: input.userId,
      action: "enrollment.reactivate",
      entity: "StudentDisciplineEnrollment",
      entityId: enrollment.id,
      metadata: { studentId: enrollment.studentId, disciplineId: enrollment.disciplineId },
      ip: input.ip,
    });
    return updated;
  });
}
