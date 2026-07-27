"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireUser, clientIp } from "@/server/auth/require-user";
import {
  deactivateEnrollment,
  enrollStudent,
  reactivateEnrollment,
  setPreferredSchedule,
} from "@/server/services/enrollments";
import { runAction, str } from "./helpers";

const enrollSchema = z.object({
  studentId: z.string().min(1),
  disciplineId: z.string().min(1),
});

export async function enrollStudentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = enrollSchema.safeParse({
      studentId: str(formData, "studentId"),
      disciplineId: str(formData, "disciplineId"),
    });
    if (!parsed.success) return { error: "Datos inválidos." };

    await enrollStudent({
      ...parsed.data,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath(`/gestion/alumnas/${parsed.data.studentId}`);
    return { success: "Inscripción creada. El horario habitual queda pendiente." };
  });
}

const preferredSchema = z.object({
  enrollmentId: z.string().min(1),
  studentId: z.string().min(1),
  // "" = dejar pendiente (solo ADMIN)
  activityId: z.string(),
});

export async function setPreferredScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = preferredSchema.safeParse({
      enrollmentId: str(formData, "enrollmentId"),
      studentId: str(formData, "studentId"),
      activityId: str(formData, "activityId"),
    });
    if (!parsed.success) return { error: "Datos inválidos." };

    await setPreferredSchedule({
      enrollmentId: parsed.data.enrollmentId,
      activityId: parsed.data.activityId === "" ? null : parsed.data.activityId,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    });
    revalidatePath(`/gestion/alumnas/${parsed.data.studentId}`);
    revalidatePath("/gestion/asistencia");
    return {
      success:
        parsed.data.activityId === ""
          ? "Horario habitual pendiente de confirmación."
          : "Horario habitual guardado. No se descontó ninguna clase.",
    };
  });
}

const toggleSchema = z.object({
  enrollmentId: z.string().min(1),
  studentId: z.string().min(1),
  action: z.enum(["deactivate", "reactivate"]),
});

export async function toggleEnrollmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = toggleSchema.safeParse({
      enrollmentId: str(formData, "enrollmentId"),
      studentId: str(formData, "studentId"),
      action: str(formData, "action"),
    });
    if (!parsed.success) return { error: "Datos inválidos." };

    const input = {
      enrollmentId: parsed.data.enrollmentId,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    };
    if (parsed.data.action === "deactivate") {
      await deactivateEnrollment(input);
    } else {
      await reactivateEnrollment(input);
    }
    revalidatePath(`/gestion/alumnas/${parsed.data.studentId}`);
    return {
      success:
        parsed.data.action === "deactivate"
          ? "Inscripción desactivada. Packs, movimientos y asistencias se conservan."
          : "Inscripción reactivada.",
    };
  });
}
