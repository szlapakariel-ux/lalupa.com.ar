import { prisma } from "@/server/db";
import type { Settings } from "@prisma/client";
import type { Tx } from "./audit";
import { audit } from "./audit";
import { DEFAULT_CONSUMPTION } from "@/lib/policy";

/** Obtiene (o crea con valores predeterminados) la configuración singleton. */
export async function getSettings(tx: Tx = prisma): Promise<Settings> {
  const existing = await tx.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return tx.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_CONSUMPTION },
  });
}

export interface UpdateSettingsInput {
  presentConsumes: boolean;
  earlyCancelConsumes: boolean;
  lateCancelConsumes: boolean;
  absentConsumes: boolean;
  trialConsumes: boolean;
  earlyCancelHours: number;
  userId: string;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<Settings> {
  const { userId, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.settings.upsert({
      where: { id: 1 },
      update: { ...data, updatedById: userId },
      create: { id: 1, ...data, updatedById: userId },
    });
    await audit(tx, {
      userId,
      action: "settings.update",
      entity: "Settings",
      entityId: "1",
      metadata: { ...data },
    });
    return updated;
  });
}
