"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireUser, clientIp } from "@/server/auth/require-user";
import { applyCorrection, assignPack, cancelPack } from "@/server/services/packs";
import { todayYMD } from "@/lib/dates";
import { runAction, str, optional } from "./helpers";

const assignSchema = z.object({
  studentId: z.string().min(1),
  productId: z.string().min(1),
  classCount: z.coerce.number().int().min(1).max(200).optional(),
  agreedPrice: z.coerce.number().min(0).max(100_000_000),
  startDateYMD: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
  withPayment: z.boolean(),
  paymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "OTRO"]).optional(),
  paymentStatus: z.enum(["PENDIENTE", "PAGADO", "PARCIAL", "BONIFICADO"]).optional(),
  paymentAmount: z.coerce.number().min(0).optional(),
});

export async function assignPackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const parsed = assignSchema.safeParse({
      studentId: str(formData, "studentId"),
      productId: str(formData, "productId"),
      classCount: optional(str(formData, "classCount")),
      agreedPrice: str(formData, "agreedPrice"),
      startDateYMD: str(formData, "startDateYMD") || todayYMD(),
      notes: optional(str(formData, "notes")),
      withPayment: str(formData, "withPayment") === "true",
      paymentMethod: optional(str(formData, "paymentMethod")),
      paymentStatus: optional(str(formData, "paymentStatus")),
      paymentAmount: optional(str(formData, "paymentAmount")),
    });
    if (!parsed.success) return { error: "Datos del pack inválidos." };
    const d = parsed.data;

    await assignPack({
      studentId: d.studentId,
      productId: d.productId,
      classCount: d.classCount,
      agreedPrice: d.agreedPrice,
      startDateYMD: d.startDateYMD,
      notes: d.notes,
      userId: user.id,
      ip: await clientIp(),
      payment: d.withPayment
        ? {
            amount: d.paymentAmount ?? d.agreedPrice,
            method: d.paymentMethod ?? "EFECTIVO",
            status: d.paymentStatus ?? "PAGADO",
          }
        : undefined,
    });

    revalidatePath(`/gestion/alumnas/${d.studentId}`);
    revalidatePath("/gestion/alumnas");
    revalidatePath("/gestion/pagos");
    return { success: "Pack cargado." };
  });
}

const correctionSchema = z.object({
  studentPackId: z.string().min(1),
  studentId: z.string().min(1),
  type: z.enum(["BONUS", "CORRECTION_POS", "CORRECTION_NEG"]),
  amount: z.coerce.number().int().min(1).max(200),
  reason: z.string().min(3, "Indicá el motivo").max(300),
});

export async function correctionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const parsed = correctionSchema.safeParse({
      studentPackId: str(formData, "studentPackId"),
      studentId: str(formData, "studentId"),
      type: str(formData, "type"),
      amount: str(formData, "amount"),
      reason: str(formData, "reason"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await applyCorrection({
      studentPackId: parsed.data.studentPackId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath(`/gestion/alumnas/${parsed.data.studentId}`);
    return { success: "Movimiento de corrección registrado." };
  });
}

export async function cancelPackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const studentPackId = str(formData, "studentPackId");
    const studentId = str(formData, "studentId");
    const reason = str(formData, "reason") || "Cancelación desde el panel";
    if (!studentPackId) return { error: "Pack inválido." };
    await cancelPack({
      studentPackId,
      reason,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath(`/gestion/alumnas/${studentId}`);
    return { success: "Pack cancelado; el saldo restante fue debitado." };
  });
}
