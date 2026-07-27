import type { Role, Weekday } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { audit } from "./audit";

/**
 * Disciplinas y sus horarios (Activity). Reglas:
 *  - el nombre funcional vive en Discipline; Activity.name es un espejo
 *    legacy que se sincroniza acá y no puede editarse por separado;
 *  - la unicidad es por nombre normalizado EXACTO (sin fusiones difusas:
 *    "Ceramica" y "Cerámica" son disciplinas distintas);
 *  - nada se borra físicamente: disciplinas y horarios se desactivan;
 *  - un horario con asistencias históricas que cambia de día u hora se
 *    reemplaza: horario nuevo + desactivación del anterior, conservando
 *    intactas las asistencias registradas.
 */

/** trim + espacios colapsados + minúsculas. Sin quitar acentos a propósito. */
export function normalizeDisciplineName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function requireAdmin(role: Role) {
  if (role !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden gestionar disciplinas.");
  }
}

export interface DisciplineInput {
  name: string;
  description?: string;
  active?: boolean;
  userId: string;
  userRole: Role;
  ip?: string;
}

export async function createDiscipline(input: DisciplineInput) {
  requireAdmin(input.userRole);
  const name = cleanName(input.name);
  if (!name) throw new DomainError("DATO_INVALIDO", "El nombre es obligatorio.");
  const normalizedName = normalizeDisciplineName(name);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.discipline.findUnique({ where: { normalizedName } });
    if (existing) {
      throw new DomainError("NOMBRE_DUPLICADO", "Ya existe una disciplina con ese nombre.");
    }
    // La casilla "activa" del formulario se respeta también al crear.
    const active = input.active ?? true;
    const discipline = await tx.discipline.create({
      data: { name, normalizedName, description: input.description ?? null, active },
    });
    await audit(tx, {
      userId: input.userId,
      action: "discipline.create",
      entity: "Discipline",
      entityId: discipline.id,
      metadata: { name, active },
      ip: input.ip,
    });
    return discipline;
  });
}

export async function updateDiscipline(
  input: DisciplineInput & { disciplineId: string; active?: boolean },
) {
  requireAdmin(input.userRole);
  const name = cleanName(input.name);
  if (!name) throw new DomainError("DATO_INVALIDO", "El nombre es obligatorio.");
  const normalizedName = normalizeDisciplineName(name);

  return prisma.$transaction(async (tx) => {
    const discipline = await tx.discipline.findUnique({ where: { id: input.disciplineId } });
    if (!discipline) throw new DomainError("NO_ENCONTRADO", "Disciplina inexistente.");

    const clash = await tx.discipline.findUnique({ where: { normalizedName } });
    if (clash && clash.id !== discipline.id) {
      throw new DomainError("NOMBRE_DUPLICADO", "Ya existe una disciplina con ese nombre.");
    }

    const nextActive = input.active ?? discipline.active;
    const updated = await tx.discipline.update({
      where: { id: discipline.id },
      data: {
        name,
        normalizedName,
        description: input.description ?? null,
        active: nextActive,
      },
    });
    // Activity.name es un espejo legacy: se sincroniza SIEMPRE desde acá.
    await tx.activity.updateMany({
      where: { disciplineId: discipline.id },
      data: { name },
    });

    const deactivated = discipline.active && !nextActive;
    await audit(tx, {
      userId: input.userId,
      action: deactivated ? "discipline.deactivate" : "discipline.update",
      entity: "Discipline",
      entityId: discipline.id,
      metadata: { name, active: nextActive },
      ip: input.ip,
    });
    return updated;
  });
}

export interface ScheduleInput {
  disciplineId: string;
  weekday: Weekday;
  /** "HH:mm" */
  startTime: string;
  durationMin: number;
  capacity?: number | null;
  teacherId?: string | null;
  active?: boolean;
  userId: string;
  userRole: Role;
  ip?: string;
}

export async function createSchedule(input: ScheduleInput) {
  requireAdmin(input.userRole);
  return prisma.$transaction(async (tx) => {
    const discipline = await tx.discipline.findUnique({ where: { id: input.disciplineId } });
    if (!discipline) throw new DomainError("NO_ENCONTRADO", "Disciplina inexistente.");
    if (!discipline.active) {
      throw new DomainError(
        "DATO_INVALIDO",
        "La disciplina está desactivada: no se pueden crear horarios.",
      );
    }

    const activity = await tx.activity.create({
      data: {
        // name espejo de la disciplina; nunca editable por separado.
        name: discipline.name,
        disciplineId: discipline.id,
        weekday: input.weekday,
        startTime: input.startTime,
        durationMin: input.durationMin,
        capacity: input.capacity ?? null,
        teacherId: input.teacherId ?? null,
        active: input.active ?? true,
      },
    });
    await audit(tx, {
      userId: input.userId,
      action: "schedule.create",
      entity: "Activity",
      entityId: activity.id,
      metadata: {
        disciplineId: discipline.id,
        weekday: input.weekday,
        startTime: input.startTime,
      },
      ip: input.ip,
    });
    return activity;
  });
}

/**
 * Edita un horario. Si el horario ya tiene asistencias y cambia el día o la
 * hora, NO se altera el registro histórico: se crea un horario nuevo con los
 * datos nuevos y se desactiva el anterior (las inscripciones que lo tenían
 * como habitual pasan al horario de reemplazo). Profesora, cupo, duración y
 * estado sí se editan en el lugar.
 */
export async function updateSchedule(
  input: ScheduleInput & { activityId: string },
) {
  requireAdmin(input.userRole);
  return prisma.$transaction(async (tx) => {
    const activity = await tx.activity.findUnique({
      where: { id: input.activityId },
      include: { discipline: { select: { id: true, name: true, active: true } } },
    });
    if (!activity) throw new DomainError("NO_ENCONTRADO", "Horario inexistente.");

    const timeChanged =
      activity.weekday !== input.weekday || activity.startTime !== input.startTime;
    const attendanceCount = await tx.attendance.count({
      where: { activityId: activity.id },
    });

    if (timeChanged && attendanceCount > 0) {
      const replacementActive = input.active ?? true;
      // Nunca puede quedar un horario operativo en una disciplina inactiva.
      if (replacementActive && !activity.discipline.active) {
        throw new DomainError(
          "DATO_INVALIDO",
          "La disciplina está desactivada: el horario de reemplazo no puede quedar activo.",
        );
      }
      // Reemplazo trazable: nuevo horario + desactivación del histórico.
      const replacement = await tx.activity.create({
        data: {
          name: activity.discipline.name,
          disciplineId: activity.discipline.id,
          weekday: input.weekday,
          startTime: input.startTime,
          durationMin: input.durationMin,
          capacity: input.capacity ?? null,
          teacherId: input.teacherId ?? null,
          active: replacementActive,
        },
      });
      await tx.activity.update({
        where: { id: activity.id },
        data: { active: false },
      });
      // El "mismo" horario se movió de día/hora: los habituales lo siguen
      // SOLO si el reemplazo queda activo; si queda inactivo, vuelven a
      // "pendiente" (null). Nada de esto toca packs, asistencias ni ledger.
      const repointed = await tx.studentDisciplineEnrollment.updateMany({
        where: { preferredActivityId: activity.id },
        data: {
          preferredActivityId: replacementActive ? replacement.id : null,
        },
      });
      await audit(tx, {
        userId: input.userId,
        action: "schedule.update",
        entity: "Activity",
        entityId: activity.id,
        metadata: {
          disciplineId: activity.discipline.id,
          replacedById: replacement.id,
          replacementActive,
          movedPreferred: replacementActive ? repointed.count : 0,
          clearedPreferred: replacementActive ? 0 : repointed.count,
          weekday: input.weekday,
          startTime: input.startTime,
        },
        ip: input.ip,
      });
      return replacement;
    }

    const nextActive = input.active ?? activity.active;
    // No se puede (re)activar un horario dentro de una disciplina inactiva.
    if (nextActive && !activity.discipline.active) {
      throw new DomainError(
        "DATO_INVALIDO",
        "La disciplina está desactivada: el horario no puede quedar activo.",
      );
    }
    const updated = await tx.activity.update({
      where: { id: activity.id },
      data: {
        weekday: input.weekday,
        startTime: input.startTime,
        durationMin: input.durationMin,
        capacity: input.capacity ?? null,
        teacherId: input.teacherId ?? null,
        active: nextActive,
      },
    });
    const deactivated = activity.active && !updated.active;
    // Un horario que deja de estar activo sin reemplazo no puede seguir
    // siendo el habitual de nadie: esas inscripciones quedan pendientes
    // (siguen activas; packs, asistencias y ledger intactos).
    let clearedPreferred = 0;
    if (deactivated) {
      const cleared = await tx.studentDisciplineEnrollment.updateMany({
        where: { preferredActivityId: activity.id },
        data: { preferredActivityId: null },
      });
      clearedPreferred = cleared.count;
    }
    await audit(tx, {
      userId: input.userId,
      action: deactivated ? "schedule.deactivate" : "schedule.update",
      entity: "Activity",
      entityId: activity.id,
      metadata: {
        disciplineId: activity.discipline.id,
        weekday: input.weekday,
        startTime: input.startTime,
        active: updated.active,
        ...(deactivated ? { clearedPreferred } : {}),
      },
      ip: input.ip,
    });
    return updated;
  });
}
