"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { prisma } from "@/server/db";
import { requireUser, clientIp } from "@/server/auth/require-user";
import { audit } from "@/server/services/audit";
import { runAction, str, optional } from "./helpers";

/* ── Actividades ─────────────────────────────────────────────────────────── */

const activitySchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  description: z.string().max(300).optional(),
  teacherId: z.string().optional(),
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
  active: z.boolean(),
});

function parseActivity(formData: FormData) {
  return activitySchema.safeParse({
    name: str(formData, "name"),
    description: optional(str(formData, "description")),
    teacherId: optional(str(formData, "teacherId")),
    weekday: str(formData, "weekday"),
    startTime: str(formData, "startTime"),
    durationMin: str(formData, "durationMin") || "60",
    capacity: optional(str(formData, "capacity")),
    active: str(formData, "active") !== "false",
  });
}

export async function saveActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const activityId = optional(str(formData, "activityId"));
    const parsed = parseActivity(formData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const data = { ...parsed.data, teacherId: parsed.data.teacherId ?? null, capacity: parsed.data.capacity ?? null };
    const activity = activityId
      ? await prisma.activity.update({ where: { id: activityId }, data })
      : await prisma.activity.create({ data });
    await audit(prisma, {
      userId: user.id,
      action: activityId ? "activity.update" : "activity.create",
      entity: "Activity",
      entityId: activity.id,
      metadata: { name: data.name, weekday: data.weekday, active: data.active },
      ip: await clientIp(),
    });
    revalidatePath("/gestion/actividades");
    return { success: activityId ? "Actividad actualizada." : "Actividad creada." };
  });
}

/* ── Productos (packs) ───────────────────────────────────────────────────── */

const productSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  classCount: z.coerce.number().int().min(1).max(200),
  referencePrice: z.coerce.number().min(0).max(100_000_000),
  validityDays: z.coerce.number().int().min(1).max(730),
  activityId: z.string().optional(),
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
      activityId: optional(str(formData, "activityId")),
      active: str(formData, "active") !== "false",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const data = { ...parsed.data, activityId: parsed.data.activityId ?? null };
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
        active: data.active,
      },
      ip: await clientIp(),
    });
    revalidatePath("/gestion/productos");
    return { success: productId ? "Producto actualizado." : "Producto creado." };
  });
}
