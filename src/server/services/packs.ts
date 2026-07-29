import type { PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { addDaysYMD, isValidYMD, todayYMD, ymdToDate } from "@/lib/dates";
import { audit } from "./audit";
import { computeBalance } from "./ledger";

export interface AssignPackInput {
  studentId: string;
  productId: string;
  /** Si difiere del producto (pack personalizado). */
  classCount?: number;
  agreedPrice: number;
  /** "YYYY-MM-DD" */
  startDateYMD: string;
  notes?: string;
  userId: string;
  ip?: string;
  /** Pago registrado junto con el pack (opcional; puede quedar PENDIENTE). */
  payment?: {
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    reference?: string;
  };
}

/**
 * Asigna un pack a una alumna: crea el pack, acredita las clases en el libro
 * (PACK_PURCHASE) y opcionalmente registra el pago — todo en una transacción.
 */
export async function assignPack(input: AssignPackInput) {
  if (!isValidYMD(input.startDateYMD)) {
    throw new DomainError("DATO_INVALIDO", "Fecha de inicio inválida.");
  }
  return prisma.$transaction(async (tx) => {
    const [student, product] = await Promise.all([
      tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null },
        select: { id: true },
      }),
      tx.packProduct.findFirst({
        where: { id: input.productId, active: true },
      }),
    ]);
    if (!student) throw new DomainError("NO_ENCONTRADO", "Alumna inexistente.");
    if (!product) throw new DomainError("NO_ENCONTRADO", "Producto inexistente o inactivo.");

    const classCount = input.classCount ?? product.classCount;
    if (classCount < 1) throw new DomainError("DATO_INVALIDO", "Cantidad de clases inválida.");
    const expiresYMD = addDaysYMD(input.startDateYMD, product.validityDays);

    const pack = await tx.studentPack.create({
      data: {
        studentId: input.studentId,
        productId: product.id,
        classCount,
        agreedPrice: input.agreedPrice,
        startDate: ymdToDate(input.startDateYMD),
        expiresAt: ymdToDate(expiresYMD),
        notes: input.notes,
        createdById: input.userId,
      },
    });

    let payment = null;
    if (input.payment) {
      payment = await tx.payment.create({
        data: {
          studentId: input.studentId,
          studentPackId: pack.id,
          concept: product.name,
          amount: input.payment.amount,
          date: ymdToDate(todayYMD()),
          method: input.payment.method,
          status: input.payment.status,
          reference: input.payment.reference,
          createdById: input.userId,
        },
      });
    }

    await tx.ledgerMovement.create({
      data: {
        studentId: input.studentId,
        studentPackId: pack.id,
        type: "PACK_PURCHASE",
        delta: classCount,
        paymentId: payment?.id ?? null,
        note: product.name,
        createdById: input.userId,
      },
    });

    await audit(tx, {
      userId: input.userId,
      action: "pack.assign",
      entity: "StudentPack",
      entityId: pack.id,
      metadata: {
        studentId: input.studentId,
        productId: product.id,
        classCount,
        agreedPrice: input.agreedPrice,
        startDate: input.startDateYMD,
        expiresAt: expiresYMD,
        withPayment: Boolean(payment),
      },
      ip: input.ip,
    });

    return { pack, payment };
  });
}

export type CorrectionType = "BONUS" | "CORRECTION_POS" | "CORRECTION_NEG";

export interface CorrectionInput {
  studentPackId: string;
  type: CorrectionType;
  /** Cantidad de clases, siempre positiva; el signo lo define el tipo. */
  amount: number;
  reason: string;
  userId: string;
  userRole: Role;
  ip?: string;
}

/**
 * Corrección o bonificación: SIEMPRE un movimiento compensatorio nuevo.
 * Jamás se edita ni borra un movimiento histórico. Solo ADMIN.
 */
export async function applyCorrection(input: CorrectionInput) {
  if (input.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden corregir movimientos.");
  }
  if (!Number.isInteger(input.amount) || input.amount < 1) {
    throw new DomainError("DATO_INVALIDO", "La cantidad debe ser un entero positivo.");
  }
  if (!input.reason.trim()) {
    throw new DomainError("DATO_INVALIDO", "Indicá el motivo de la corrección.");
  }
  const delta = input.type === "CORRECTION_NEG" ? -input.amount : input.amount;

  return prisma.$transaction(async (tx) => {
    const pack = await tx.studentPack.findUnique({
      where: { id: input.studentPackId },
      select: { id: true, studentId: true, status: true, expiresAt: true },
    });
    if (!pack) throw new DomainError("NO_ENCONTRADO", "Pack inexistente.");

    const movement = await tx.ledgerMovement.create({
      data: {
        studentId: pack.studentId,
        studentPackId: pack.id,
        type: input.type,
        delta,
        note: input.reason.slice(0, 300),
        createdById: input.userId,
      },
    });

    const balance = await computeBalance(tx, pack.id);
    if (balance <= 0 && pack.status === "ACTIVO") {
      await tx.studentPack.update({ where: { id: pack.id }, data: { status: "AGOTADO" } });
    } else if (balance > 0 && pack.status === "AGOTADO") {
      await tx.studentPack.update({ where: { id: pack.id }, data: { status: "ACTIVO" } });
    }

    await audit(tx, {
      userId: input.userId,
      action: "pack.correction",
      entity: "LedgerMovement",
      entityId: movement.id,
      metadata: {
        studentPackId: pack.id,
        type: input.type,
        delta,
        reason: input.reason,
      },
      ip: input.ip,
    });

    return { movement, balance };
  });
}

export interface CancelPackInput {
  studentPackId: string;
  reason: string;
  userId: string;
  userRole: Role;
  ip?: string;
}

/** Cancela un pack: movimiento CANCELLATION por el saldo restante + estado CANCELADO. */
export async function cancelPack(input: CancelPackInput) {
  if (input.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden cancelar packs.");
  }
  return prisma.$transaction(async (tx) => {
    const pack = await tx.studentPack.findUnique({
      where: { id: input.studentPackId },
      select: { id: true, studentId: true, status: true },
    });
    if (!pack) throw new DomainError("NO_ENCONTRADO", "Pack inexistente.");
    if (pack.status === "CANCELADO") {
      throw new DomainError("YA_REVERTIDA", "El pack ya está cancelado.");
    }

    const balance = await computeBalance(tx, pack.id);
    if (balance !== 0) {
      await tx.ledgerMovement.create({
        data: {
          studentId: pack.studentId,
          studentPackId: pack.id,
          type: "CANCELLATION",
          delta: -balance,
          note: input.reason.slice(0, 300),
          createdById: input.userId,
        },
      });
    }
    await tx.studentPack.update({
      where: { id: pack.id },
      data: { status: "CANCELADO" },
    });

    await audit(tx, {
      userId: input.userId,
      action: "pack.cancel",
      entity: "StudentPack",
      entityId: pack.id,
      metadata: { balanceCancelled: balance, reason: input.reason },
      ip: input.ip,
    });

    return { cancelledBalance: balance };
  });
}

/**
 * Marca como VENCIDO todo pack ACTIVO cuya vigencia pasó, debitando el saldo
 * restante con un movimiento EXPIRATION. Idempotente; se dispara al cargar
 * el dashboard (sin cron en el MVP).
 */
export async function expirePacks(referenceYMD: string = todayYMD()) {
  const candidates = await prisma.studentPack.findMany({
    where: { status: "ACTIVO", expiresAt: { lt: ymdToDate(referenceYMD) } },
    select: { id: true, studentId: true },
  });

  let expired = 0;
  for (const candidate of candidates) {
    await prisma.$transaction(async (tx) => {
      // Reconfirmar bajo lock que sigue ACTIVO (idempotencia ante concurrencia).
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "StudentPack"
        WHERE id = ${candidate.id} AND status = 'ACTIVO' FOR UPDATE`;
      if (rows.length === 0) return;

      const balance = await computeBalance(tx, candidate.id);
      if (balance > 0) {
        await tx.ledgerMovement.create({
          data: {
            studentId: candidate.studentId,
            studentPackId: candidate.id,
            type: "EXPIRATION",
            delta: -balance,
            note: `Vencimiento al ${referenceYMD}`,
            // Movimiento de sistema: lo firma la admin fundadora vía seed;
            // al no haber usuario "sistema", se registra sin auditoría de usuario.
            createdById: (await systemUserId(tx)),
          },
        });
      }
      await tx.studentPack.update({
        where: { id: candidate.id },
        data: { status: "VENCIDO" },
      });
      await audit(tx, {
        userId: null,
        action: "pack.expire",
        entity: "StudentPack",
        entityId: candidate.id,
        metadata: { balanceExpired: balance, reference: referenceYMD },
      });
      expired += 1;
    });
  }
  return { expired };
}

/** Primer usuario ADMIN activo, usado como firmante de movimientos de sistema. */
async function systemUserId(tx: Parameters<typeof computeBalance>[0]): Promise<string> {
  const admin = await tx.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) throw new DomainError("NO_ENCONTRADO", "No existe una administradora activa.");
  return admin.id;
}
