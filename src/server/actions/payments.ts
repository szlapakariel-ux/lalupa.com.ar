"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireUser, clientIp } from "@/server/auth/require-user";
import {
  annulPayment,
  registerPayment,
  updatePaymentStatus,
} from "@/server/services/payments";
import { todayYMD } from "@/lib/dates";
import { runAction, str, optional } from "./helpers";

const paymentSchema = z.object({
  studentId: z.string().min(1),
  studentPackId: z.string().optional(),
  concept: z.string().max(200).optional(),
  amount: z.coerce.number().min(0).max(100_000_000),
  dateYMD: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "OTRO"]),
  status: z.enum(["PENDIENTE", "PAGADO", "PARCIAL", "BONIFICADO"]),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

export async function registerPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const parsed = paymentSchema.safeParse({
      studentId: str(formData, "studentId"),
      studentPackId: optional(str(formData, "studentPackId")),
      concept: optional(str(formData, "concept")),
      amount: str(formData, "amount"),
      dateYMD: str(formData, "dateYMD") || todayYMD(),
      method: str(formData, "method"),
      status: str(formData, "status"),
      reference: optional(str(formData, "reference")),
      notes: optional(str(formData, "notes")),
    });
    if (!parsed.success) return { error: "Datos del pago inválidos." };

    await registerPayment({
      ...parsed.data,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });

    revalidatePath("/gestion/pagos");
    revalidatePath(`/gestion/alumnas/${parsed.data.studentId}`);
    return { success: "Pago registrado." };
  });
}

export async function updatePaymentStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const paymentId = str(formData, "paymentId");
    const status = z
      .enum(["PENDIENTE", "PAGADO", "PARCIAL", "BONIFICADO"])
      .safeParse(str(formData, "status"));
    if (!paymentId || !status.success) return { error: "Datos inválidos." };
    await updatePaymentStatus({
      paymentId,
      status: status.data,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath("/gestion/pagos");
    return { success: "Estado del pago actualizado." };
  });
}

export async function annulPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const paymentId = str(formData, "paymentId");
    const reason = str(formData, "reason");
    if (!paymentId) return { error: "Pago inválido." };
    if (!reason) return { error: "Indicá el motivo de la anulación." };
    await annulPayment({
      paymentId,
      reason,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath("/gestion/pagos");
    return { success: "Pago anulado (queda registrado en el historial)." };
  });
}
