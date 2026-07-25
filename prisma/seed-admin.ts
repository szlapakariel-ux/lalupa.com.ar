/**
 * Bootstrap de la PRIMERA administradora en producción.
 *
 * Reglas (auditoría P1-01):
 *  - Sin SEED_ADMIN_EMAIL ni SEED_ADMIN_PASSWORD: no se crea nada (omitido).
 *  - Con solo una de las dos variables: aborta sin crear nada.
 *  - Con ambas: email válido + contraseña de al menos 12 caracteres que no
 *    sea una credencial de desarrollo conocida.
 *  - Si ya existe CUALQUIER usuario, este procedimiento nunca crea otra
 *    administradora ni modifica cuentas existentes (idempotente y seguro).
 *  - La contraseña jamás se imprime ni se guarda sin hash.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** Credenciales ficticias de DESARROLLO; prohibidas en producción. */
export const DEV_CREDENTIALS = ["lupa-admin-dev", "lupa-profe-dev"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Error de configuración del seed: mensaje seguro, nunca incluye la contraseña. */
export class SeedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedConfigError";
  }
}

export interface SeedAdminEnv {
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
}

export interface SeedAdminResult {
  /** true solo si se creó la administradora inicial en esta corrida. */
  created: boolean;
}

/**
 * Ejecuta el bootstrap productivo. Lanza SeedConfigError ante configuración
 * inválida o insegura; en ese caso no escribe nada en la base.
 */
export async function seedProductionAdmin(
  prisma: PrismaClient,
  env: SeedAdminEnv,
  log: (message: string) => void = console.log,
): Promise<SeedAdminResult> {
  const email = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email && !password) {
    log("Seed administrativo omitido: SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD no están definidas.");
    return { created: false };
  }
  if (!email || !password) {
    throw new SeedConfigError(
      "Configuración incompleta: SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben definirse JUNTAS. No se creó ningún usuario.",
    );
  }
  if (!EMAIL_RE.test(email)) {
    throw new SeedConfigError("SEED_ADMIN_EMAIL no es un email válido. No se creó ningún usuario.");
  }
  if (DEV_CREDENTIALS.some((dev) => dev.toLowerCase() === password.toLowerCase())) {
    throw new SeedConfigError(
      "SEED_ADMIN_PASSWORD es una credencial de desarrollo conocida y está prohibida en producción. No se creó ningún usuario.",
    );
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new SeedConfigError(
      `SEED_ADMIN_PASSWORD debe tener al menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres. No se creó ningún usuario.`,
    );
  }

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      // Segunda ejecución con las mismas variables: no cambia contraseña,
      // rol ni ningún otro dato de la cuenta existente.
      log(`Seed administrativo: ${email} ya existe. Sin cambios.`);
      return { created: false };
    }
    throw new SeedConfigError(
      "Ya existen usuarios: este seed solo crea la PRIMERA administradora. " +
        "Las cuentas adicionales se crean desde /gestion/usuarios. No se creó ningún usuario.",
    );
  }

  await prisma.user.create({
    data: {
      email,
      name: "Administradora",
      passwordHash: await bcrypt.hash(password, 11),
      role: "ADMIN",
    },
  });
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  log(`Administradora inicial creada: ${email}. Eliminá SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD.`);
  return { created: true };
}
