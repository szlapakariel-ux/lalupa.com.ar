"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { prisma } from "@/server/db";
import { requireUser, clientIp } from "@/server/auth/require-user";
import { hashPassword } from "@/server/auth/password";
import { audit } from "@/server/services/audit";
import { runAction, str, optional } from "./helpers";

const userSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  name: z.string().min(1, "Nombre requerido").max(120),
  role: z.enum(["ADMIN", "TEACHER"]),
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(200)
    .optional(),
  active: z.boolean(),
});

export async function saveUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireUser("ADMIN");
    const userId = optional(str(formData, "userId"));
    const parsed = userSchema.safeParse({
      email: str(formData, "email"),
      name: str(formData, "name"),
      role: str(formData, "role"),
      password: optional(str(formData, "password")),
      active: str(formData, "active") !== "false",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
    }
    const { password, ...data } = parsed.data;

    if (!userId && !password) {
      return { error: "Definí una contraseña inicial para la nueva usuaria." };
    }
    if (userId === admin.id && (!data.active || data.role !== "ADMIN")) {
      return { error: "No podés desactivar ni bajar de rol tu propia cuenta." };
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== userId) {
      return { error: "Ya existe una usuaria con ese email." };
    }

    const user = userId
      ? await prisma.user.update({
          where: { id: userId },
          data: {
            ...data,
            ...(password ? { passwordHash: await hashPassword(password) } : {}),
          },
        })
      : await prisma.user.create({
          data: { ...data, passwordHash: await hashPassword(password!) },
        });

    // Si se desactivó la cuenta, sus sesiones quedan revocadas.
    if (!data.active) {
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await audit(prisma, {
      userId: admin.id,
      action: userId ? "user.update" : "user.create",
      entity: "User",
      entityId: user.id,
      metadata: {
        email: data.email,
        role: data.role,
        active: data.active,
        passwordChanged: Boolean(password),
      },
      ip: await clientIp(),
    });

    revalidatePath("/gestion/usuarios");
    return { success: userId ? "Usuaria actualizada." : "Usuaria creada." };
  });
}
