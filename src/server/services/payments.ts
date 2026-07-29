import type { PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/lib/errors";
import { isValidYMD, ymdToDate } from "@/lib/dates";
import { audit } from "./audit";

export interface RegisterPaymentInput {
  studentId: string;
  studentPackId?: string;
  concept?: string;
  amount: number;
  /** "YYYY-MM-DD" */
  dateYMD: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  notes?: string;
  userId: string;
  userRole: Role;
  ip?: string;
}

/** Registra un pago. El pago y el saldo de clases son conceptos separados. */
export async function registerPayment(input: RegisterPaymentInput) {
  if (input.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden registrar pagos.");
  }
  if (!isValidYMD(input.dateYMD)) {
    throw new DomainError("DATO_INVALIDO", "Fecha inválida.");
  }
  if (!(input.amount >= 0)) {
    throw new DomainError("DATO_INVALIDO", "Importe inválido.");
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new DomainError("NO_ENCONTRADO", "Alumna inexistente.");

    if (input.studentPackId) {
      const pack = await tx.studentPack.findFirst({
        where: { id: input.studentPackId, studentId: input.studentId },
        select: { id: true },
      });
      if (!pack) throw new DomainError("NO_ENCONTRADO", "El pack no pertenece a la alumna.");
    }

    const payment = await tx.payment.create({
      data: {
        studentId: input.studentId,
        studentPackId: input.studentPackId ?? null,
        concept: input.concept,
        amount: input.amount,
        date: ymdToDate(input.dateYMD),
        method: input.method,
        status: input.status,
        reference: input.reference,
        notes: input.notes,
        createdById: input.userId,
      },
    });

    await audit(tx, {
      userId: input.userId,
      action: "payment.register",
      entity: "Payment",
      entityId: payment.id,
      metadata: {
        studentId: input.studentId,
        amount: input.amount,
        method: input.method,
        status: input.status,
        date: input.dateYMD,
      },
      ip: input.ip,
    });

    return payment;
  });
}

export interface UpdatePaymentStatusInput {
  paymentId: string;
  status: Exclude<PaymentStatus, "ANULADO">;
  userId: string;
  userRole: Role;
  ip?: string;
}

/** Cambia el estado de un pago (pendiente → pagado, parcial, etc.). */
export async function updatePaymentStatus(input: UpdatePaymentStatusInput) {
  if (input.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden modificar pagos.");
  }
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw new DomainError("NO_ENCONTRADO", "Pago inexistente.");
    if (payment.status === "ANULADO") {
      throw new DomainError("DATO_INVALIDO", "Un pago anulado no puede modificarse.");
    }

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: input.status },
    });

    await audit(tx, {
      userId: input.userId,
      action: "payment.status",
      entity: "Payment",
      entityId: payment.id,
      metadata: { from: payment.status, to: input.status },
      ip: input.ip,
    });

    return updated;
  });
}

export interface AnnulPaymentInput {
  paymentId: string;
  reason: string;
  userId: string;
  userRole: Role;
  ip?: string;
}

/** Anulación soft: el pago queda ANULADO con quién y cuándo; nunca se borra. */
export async function annulPayment(input: AnnulPaymentInput) {
  if (input.userRole !== "ADMIN") {
    throw new DomainError("NO_AUTORIZADO", "Solo administradoras pueden anular pagos.");
  }
  if (!input.reason.trim()) {
    throw new DomainError("DATO_INVALIDO", "Indicá el motivo de la anulación.");
  }
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw new DomainError("NO_ENCONTRADO", "Pago inexistente.");
    if (payment.status === "ANULADO") {
      throw new DomainError("YA_REVERTIDA", "El pago ya está anulado.");
    }

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "ANULADO",
        annulledAt: new Date(),
        annulledById: input.userId,
        notes: payment.notes
          ? `${payment.notes}\nAnulado: ${input.reason.slice(0, 200)}`
          : `Anulado: ${input.reason.slice(0, 200)}`,
      },
    });

    await audit(tx, {
      userId: input.userId,
      action: "payment.annul",
      entity: "Payment",
      entityId: payment.id,
      metadata: { previousStatus: payment.status, reason: input.reason },
      ip: input.ip,
    });

    return updated;
  });
}
