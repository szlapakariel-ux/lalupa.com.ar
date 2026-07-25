"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireUser } from "@/server/auth/require-user";
import { updateSettings } from "@/server/services/settings";
import { runAction, str } from "./helpers";

const schema = z.object({
  presentConsumes: z.boolean(),
  earlyCancelConsumes: z.boolean(),
  lateCancelConsumes: z.boolean(),
  absentConsumes: z.boolean(),
  trialConsumes: z.boolean(),
  earlyCancelHours: z.coerce.number().int().min(0).max(168),
});

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("ADMIN");
    const parsed = schema.safeParse({
      presentConsumes: str(formData, "presentConsumes") === "on",
      earlyCancelConsumes: str(formData, "earlyCancelConsumes") === "on",
      lateCancelConsumes: str(formData, "lateCancelConsumes") === "on",
      absentConsumes: str(formData, "absentConsumes") === "on",
      trialConsumes: str(formData, "trialConsumes") === "on",
      earlyCancelHours: str(formData, "earlyCancelHours") || "24",
    });
    if (!parsed.success) return { error: "Datos inválidos." };
    await updateSettings({ ...parsed.data, userId: user.id });
    revalidatePath("/gestion/configuracion");
    return { success: "Configuración guardada." };
  });
}
