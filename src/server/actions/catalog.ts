"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { prisma } from "@/server/db";
import { requireUser, clientIp } from "@/server/auth/require-user";
import { audit } from "@/server/services/audit";
import {
  createDiscipline,
  createSchedule,
  updateDiscipline,
  updateSchedule,
} from "@/server/services/disciplines";
import { runAction, str, optional } from "./helpers";

/* ── Disciplinas ─────────────────────────────────────────────────────────── */

const disciplineSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  description: z.string().max(300).optional(),
  active: z.boolean(),
});

export async function saveDisciplineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const disciplineId = optional(str(formData, "disciplineId"));
    const parsed = disciplineSchema.safeParse({
      name: str(formData, "name"),
      description: optional(str(formData, "description")),
      active: str(formData, "active") === "true",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }

    if (disciplineId) {
      await updateDiscipline({
        disciplineId,
        name: parsed.data.name,
        description: parsed.data.description,
        active: parsed.data.active,
        userId: user.id,
        userRole: user.role,
        ip: await clientIp(),
      });
    } else {
      await createDiscipline({
        name: parsed.data.name,
        description: parsed.data.description,
        active: parsed.data.active,
        userId: user.id,
        userRole: user.role,
        ip: await clientIp(),
      });
    }
    revalidatePath("/gestion/actividades");
    revalidatePath("/gestion/productos");
    return { success: disciplineId ? "Disciplina actualizada." : "Disciplina creada." };
  });
}

/* ── Horarios ────────────────────────────────────────────────────────────── */

const scheduleSchema = z.object({
  disciplineId: z.string().min(1),
  weekday: z.enum([
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
    "DOMINGO",
  ]),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario inválido (HH:MM)"),
  durationMin: z.coerce.number().int().min(15).max(480),
  capacity: z.coerce.number().int().min(1).max(200).optional(),
  teacherId: z.string().optional(),
  active: z.boolean(),
});

export async function saveScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const activityId = optional(str(formData, "activityId"));
    const parsed = scheduleSchema.safeParse({
      disciplineId: str(formData, "disciplineId"),
      weekday: str(formData, "weekday"),
      startTime: str(formData, "startTime"),
      durationMin: str(formData, "durationMin") || "60",
      capacity: optional(str(formData, "capacity")),
      teacherId: optional(str(formData, "teacherId")),
      active: str(formData, "active") === "true",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }

    const common = {
      disciplineId: parsed.data.disciplineId,
      weekday: parsed.data.weekday,
      startTime: parsed.data.startTime,
      durationMin: parsed.data.durationMin,
      capacity: parsed.data.capacity ?? null,
      teacherId: parsed.data.teacherId ?? null,
      active: parsed.data.active,
      userId: user.id,
      userRole: user.role,
      ip: await clientIp(),
    };
    if (activityId) {
      await updateSchedule({ ...common, activityId });
    } else {
      await createSchedule(common);
    }
    revalidatePath("/gestion/actividades");
    revalidatePath("/gestion/asistencia");
    return { success: activityId ? "Horario actualizado." : "Horario creado." };
  });
}

/* ── Productos (packs) ───────────────────────────────────────────────────── */

const productSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  classCount: z.coerce.number().int().min(1).max(200),
  referencePrice: z.coerce.number().min(0).max(100_000_000),
  validityDays: z.coerce.number().int().min(1).max(730),
  // "" = todas las disciplinas (disciplineId null)
  disciplineId: z.string().optional(),
  active: z.boolean(),
});

export async function saveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const productId = optional(str(formData, "productId"));
    const parsed = productSchema.safeParse({
      name: str(formData, "name"),
      classCount: str(formData, "classCount"),
      referencePrice: str(formData, "referencePrice"),
      validityDays: str(formData, "validityDays"),
      disciplineId: optional(str(formData, "disciplineId")),
      active: str(formData, "active") === "true",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    // La compatibilidad se define por DISCIPLINA (null = todas);
    // activityId queda como columna legacy y no se escribe más.
    const data = { ...parsed.data, disciplineId: parsed.data.disciplineId ?? null };

    // Validación server-side de la disciplina elegida: debe existir y, para
    // ASIGNACIONES NUEVAS (crear, o cambiar a otra disciplina), estar activa.
    // Conservar la disciplina actual de un producto existente sí se permite
    // aunque esté inactiva (no se lo convierte silenciosamente en genérico).
    if (data.disciplineId) {
      const discipline = await prisma.discipline.findUnique({
        where: { id: data.disciplineId },
        select: { id: true, active: true },
      });
      if (!discipline) return { error: "La disciplina elegida no existe." };
      const current = productId
        ? await prisma.packProduct.findUnique({
            where: { id: productId },
            select: { disciplineId: true },
          })
        : null;
      const keepsSame = current?.disciplineId === data.disciplineId;
      if (!discipline.active && !keepsSame) {
        return { error: "La disciplina elegida está inactiva; elegí una activa." };
      }
    }

    const product = productId
      ? await prisma.packProduct.update({ where: { id: productId }, data })
      : await prisma.packProduct.create({ data });
    await audit(prisma, {
      userId: user.id,
      action: productId ? "product.update" : "product.create",
      entity: "PackProduct",
      entityId: product.id,
      metadata: {
        name: data.name,
        classCount: data.classCount,
        validityDays: data.validityDays,
        disciplineId: data.disciplineId,
        active: data.active,
      },
      ip: await clientIp(),
    });
    revalidatePath("/gestion/productos");
    return { success: productId ? "Producto actualizado." : "Producto creado." };
  });
}
