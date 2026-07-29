import { Prisma, type AttendanceStatus, type Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { WEEKDAY_LABELS, isValidYMD, weekdayOfYMD, ymdToDate } from "@/lib/dates";
import { consumesClass, pickPackFIFO } from "@/lib/policy";
import { audit } from "./audit";
import { availableBalance, computeBalance, packsWithBalances } from "./ledger";
import { getSettings } from "./settings";

export interface RegisterAttendanceInput {
  studentId: string;
  activityId: string;
  /** "YYYY-MM-DD" (fecha local argentina de la clase) */
  dateYMD: string;
  status: AttendanceStatus;
  notes?: string;
  userId: string;
  userRole: Role;
  /** Permite dejar saldo negativo; SOLO administradoras. */
  allowNegative?: boolean;
  ip?: string;
}

export interface RegisterAttendanceResult {
  attendanceId: string;
  movementId: string | null;
  packId: string | null;
  packName: string | null;
  consumed: boolean;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * Registra una asistencia y, si corresponde según la configuración,
 * descuenta UNA clase del pack elegible — todo en una única transacción:
 * asistencia + movimiento + auditoría, o nada.
 *
 * Defensas contra doble descuento:
 *  - constraint único (studentId, activityId, date) en Attendance;
 *  - FOR UPDATE sobre los packs de la alumna (serializa débitos concurrentes).
 */
export async function registerAttendance(
  input: RegisterAttendanceInput,
): Promise<RegisterAttendanceResult> {
  if (!isValidYMD(input.dateYMD)) {
    throw new DomainError("DATO_INVALIDO", "Fecha inválida.");
  }
  if (input.allowNegative && input.userRole !== "ADMIN") {
    throw new DomainError(
      "NO_AUTORIZADO",
      "Solo una administradora puede registrar con saldo negativo.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const [student, activity, settings] = await Promise.all([
      tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null },
        select: { id: true },
      }),
      tx.activity.findUnique({
        where: { id: input.activityId },
        select: {
          id: true,
          name: true,
          active: true,
          weekday: true,
          disciplineId: true,
          discipline: { select: { id: true, name: true, active: true } },
        },
      }),
      getSettings(tx),
    ]);
    if (!student) throw new DomainError("NO_ENCONTRADO", "Alumna inexistente.");
    if (!activity) throw new DomainError("NO_ENCONTRADO", "Horario inexistente.");
    if (!activity.active) {
      throw new DomainError("DATO_INVALIDO", "El horario está desactivado.");
    }
    // La disciplina también debe estar activa: un horario jamás es operativo
    // dentro de una disciplina desactivada.
    if (!activity.discipline.active) {
      throw new DomainError(
        "DATO_INVALIDO",
        `La disciplina ${activity.discipline.name} está desactivada.`,
      );
    }

    // La fecha debe caer en el día de la semana del horario elegido.
    if (weekdayOfYMD(input.dateYMD) !== activity.weekday) {
      const dia = WEEKDAY_LABELS[activity.weekday].toLowerCase();
      throw new DomainError(
        "FECHA_NO_COINCIDE",
        `El horario seleccionado corresponde a ${dia}. Elegí una fecha de ${dia}.`,
      );
    }

    // La alumna debe tener inscripción ACTIVA en la disciplina del horario.
    // (El horario habitual NO es obligatorio: cualquier horario de la misma
    // disciplina sirve, y registrar acá nunca modifica el habitual.)
    const enrollment = await tx.studentDisciplineEnrollment.findUnique({
      where: {
        studentId_disciplineId: {
          studentId: input.studentId,
          disciplineId: activity.disciplineId,
        },
      },
      select: { id: true, active: true },
    });
    if (!enrollment || !enrollment.active) {
      throw new DomainError(
        "SIN_INSCRIPCION",
        `La alumna no tiene inscripción activa en ${activity.discipline.name}.`,
      );
    }

    const consumed = consumesClass(settings, input.status);

    // Lock de packs solo cuando vamos a debitar.
    const packs = await packsWithBalances(tx, input.studentId, { lock: consumed });
    const balanceBefore = availableBalance(packs, activity.disciplineId, input.dateYMD);

    let packId: string | null = null;
    let packName: string | null = null;

    if (consumed) {
      const pick = pickPackFIFO(packs, activity.disciplineId, input.dateYMD);
      if (pick) {
        packId = pick.id;
        packName = packs.find((p) => p.id === pick.id)?.productName ?? null;
      } else if (input.allowNegative) {
        // Acción administrativa explícita: se debita en negativo el pack
        // COMPATIBLE más reciente no cancelado. Compatible = genérico
        // (disciplina null) o de la MISMA disciplina de la clase; un pack
        // específico de otra disciplina jamás se debita.
        const fallback = packs
          .filter(
            (p) =>
              p.status !== "CANCELADO" &&
              (p.productDisciplineId === null ||
                p.productDisciplineId === activity.disciplineId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        if (!fallback) {
          throw new DomainError(
            "SIN_SALDO",
            "La alumna no tiene ningún pack genérico ni de esta disciplina.",
          );
        }
        packId = fallback.id;
        packName = fallback.productName;
      } else {
        throw new DomainError("SIN_SALDO", "Sin clases disponibles para esta actividad.");
      }
    }

    let attendance;
    try {
      attendance = await tx.attendance.create({
        data: {
          date: ymdToDate(input.dateYMD),
          activityId: input.activityId,
          studentId: input.studentId,
          status: input.status,
          notes: input.notes,
          registeredById: input.userId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new DomainError("YA_REGISTRADA", "Asistencia duplicada.");
      }
      throw e;
    }

    let movementId: string | null = null;
    if (consumed && packId) {
      const movement = await tx.ledgerMovement.create({
        data: {
          studentId: input.studentId,
          studentPackId: packId,
          type: "CLASS_USED",
          delta: -1,
          attendanceId: attendance.id,
          note: `${activity.name} ${input.dateYMD}`,
          createdById: input.userId,
        },
      });
      movementId = movement.id;

      const newPackBalance = await computeBalance(tx, packId);
      if (newPackBalance <= 0) {
        await tx.studentPack.updateMany({
          where: { id: packId, status: "ACTIVO" },
          data: { status: "AGOTADO" },
        });
      }
    }

    await audit(tx, {
      userId: input.userId,
      action: "attendance.register",
      entity: "Attendance",
      entityId: attendance.id,
      metadata: {
        studentId: input.studentId,
        activityId: input.activityId,
        disciplineId: activity.disciplineId,
        date: input.dateYMD,
        status: input.status,
        consumed,
        packId,
        allowNegative: input.allowNegative ?? false,
      },
      ip: input.ip,
    });

    return {
      attendanceId: attendance.id,
      movementId,
      packId,
      packName,
      consumed,
      balanceBefore,
      balanceAfter: balanceBefore - (consumed ? 1 : 0),
    };
  });
}

export interface RevertAttendanceInput {
  attendanceId: string;
  reason: string;
  userId: string;
  ip?: string;
}

/**
 * Reversión trazable: la asistencia se marca revertida (no se borra) y el
 * movimiento de débito se compensa con un movimiento REVERSAL (+1).
 * El unique sobre reversalOfId impide revertir dos veces.
 */
export async function revertAttendance(input: RevertAttendanceInput) {
  return prisma.$transaction(async (tx) => {
    const attendance = await tx.attendance.findUnique({
      where: { id: input.attendanceId },
      include: { ledger: { where: { type: "CLASS_USED" } } },
    });
    if (!attendance) throw new DomainError("NO_ENCONTRADO", "Asistencia inexistente.");
    if (attendance.revertedAt) {
      throw new DomainError("YA_REVERTIDA", "La asistencia ya fue revertida.");
    }

    await tx.attendance.update({
      where: { id: attendance.id },
      data: { revertedAt: new Date(), revertedById: input.userId },
    });

    const debit = attendance.ledger[0];
    if (debit) {
      try {
        await tx.ledgerMovement.create({
          data: {
            studentId: attendance.studentId,
            studentPackId: debit.studentPackId,
            type: "REVERSAL",
            delta: -debit.delta, // compensa exactamente el débito
            attendanceId: attendance.id,
            reversalOfId: debit.id,
            note: input.reason.slice(0, 300),
            createdById: input.userId,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new DomainError("YA_REVERTIDA", "El movimiento ya fue revertido.");
        }
        throw e;
      }

      if (debit.studentPackId) {
        const pack = await tx.studentPack.findUnique({
          where: { id: debit.studentPackId },
          select: { status: true },
        });
        const balance = await computeBalance(tx, debit.studentPackId);
        if (pack?.status === "AGOTADO" && balance > 0) {
          await tx.studentPack.update({
            where: { id: debit.studentPackId },
            data: { status: "ACTIVO" },
          });
        }
      }
    }

    await audit(tx, {
      userId: input.userId,
      action: "attendance.revert",
      entity: "Attendance",
      entityId: attendance.id,
      metadata: {
        studentId: attendance.studentId,
        hadDebit: Boolean(debit),
        reason: input.reason,
      },
      ip: input.ip,
    });

    return { attendanceId: attendance.id, restored: Boolean(debit) };
  });
}
