"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireUser, clientIp } from "@/server/auth/require-user";
import {
  registerAttendance,
  revertAttendance,
} from "@/server/services/attendance";
import { runAction, str } from "./helpers";

const registerSchema = z.object({
  studentId: z.string().min(1),
  activityId: z.string().min(1),
  dateYMD: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([
    "PRESENTE",
    "CANCELO_A_TIEMPO",
    "CANCELO_TARDE",
    "AUSENTE",
    "CLASE_PRUEBA",
  ]),
  allowNegative: z.boolean(),
});

export async function registerAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = registerSchema.safeParse({
      studentId: str(formData, "studentId"),
      activityId: str(formData, "activityId"),
      dateYMD: str(formData, "dateYMD"),
      status: str(formData, "status"),
      allowNegative: str(formData, "allowNegative") === "true",
    });
    if (!parsed.success) return { error: "Datos inválidos." };

    const result = await registerAttendance({
      ...parsed.data,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });

    revalidatePath("/gestion/asistencia");
    revalidatePath("/gestion");
    revalidatePath(`/gestion/alumnas/${parsed.data.studentId}`);

    const saldo = result.consumed
      ? `Se descontó 1 clase (quedan ${result.balanceAfter}).`
      : "No se descontó ninguna clase.";
    return { success: `Registrado. ${saldo}` };
  });
}

export async function revertAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const attendanceId = str(formData, "attendanceId");
    const reason = str(formData, "reason") || "Reversión desde el panel";
    if (!attendanceId) return { error: "Asistencia inválida." };

    await revertAttendance({
      attendanceId,
      reason,
      userId: user.id,
      ip: await clientIp(),
    });

    revalidatePath("/gestion/asistencia");
    revalidatePath("/gestion");
    return { success: "Asistencia revertida; la clase volvió al saldo." };
  });
}
