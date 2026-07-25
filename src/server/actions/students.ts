"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireUser, clientIp } from "@/server/auth/require-user";
import {
  createAlert,
  createStudent,
  updateAlert,
  updateStudent,
} from "@/server/services/students";
import { runAction, str, optional } from "./helpers";

const studentSchema = z.object({
  firstName: z.string().min(1, "Nombre requerido").max(80),
  lastName: z.string().min(1, "Apellido requerido").max(80),
  phone: z.string().max(40).optional(),
  email: z.string().email("Email inválido").optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["ACTIVA", "PAUSADA", "INACTIVA"]).default("ACTIVA"),
});

function parseStudent(formData: FormData) {
  return studentSchema.safeParse({
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    phone: optional(str(formData, "phone")),
    email: optional(str(formData, "email")),
    emergencyContactName: optional(str(formData, "emergencyContactName")),
    emergencyContactPhone: optional(str(formData, "emergencyContactPhone")),
    notes: optional(str(formData, "notes")),
    status: str(formData, "status") || "ACTIVA",
  });
}

export async function createStudentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const parsed = parseStudent(formData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await createStudent(parsed.data, {
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath("/gestion/alumnas");
    return { success: "Alumna creada." };
  });
}

export async function updateStudentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const studentId = str(formData, "studentId");
    const parsed = parseStudent(formData);
    if (!studentId || !parsed.success) {
      return { error: parsed.success ? "Alumna inválida." : parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    await updateStudent(studentId, parsed.data, {
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath("/gestion/alumnas");
    revalidatePath(`/gestion/alumnas/${studentId}`);
    return { success: "Datos actualizados." };
  });
}

const alertSchema = z.object({
  type: z.enum([
    "ALERGIA",
    "LESION",
    "LIMITACION",
    "RESTRICCION_ALIMENTARIA",
    "CONTACTO_EMERGENCIA",
    "OTRA",
  ]),
  title: z.string().min(1, "Descripción requerida").max(120),
  instruction: z.string().max(300).optional(),
  visibility: z.enum(["TODOS", "SOLO_ADMIN"]),
});

export async function createAlertAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const studentId = str(formData, "studentId");
    const parsed = alertSchema.safeParse({
      type: str(formData, "type"),
      title: str(formData, "title"),
      instruction: optional(str(formData, "instruction")),
      visibility: str(formData, "visibility") || "TODOS",
    });
    if (!studentId || !parsed.success) {
      return { error: "Datos de la alerta inválidos." };
    }
    await createAlert(studentId, parsed.data, {
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath(`/gestion/alumnas/${studentId}`);
    return { success: "Alerta cargada." };
  });
}

export async function toggleAlertAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const alertId = str(formData, "alertId");
    const studentId = str(formData, "studentId");
    const active = str(formData, "active") === "true";
    if (!alertId) return { error: "Alerta inválida." };
    await updateAlert(alertId, { active }, {
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath(`/gestion/alumnas/${studentId}`);
    return { success: active ? "Alerta reactivada." : "Alerta desactivada." };
  });
}
