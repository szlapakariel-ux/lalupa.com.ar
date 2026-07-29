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
 *  - Ejecuciones SIMULTÁNEAS (varios procesos o réplicas) quedan
 *    serializadas en PostgreSQL con un advisory lock transaccional:
 *    a lo sumo una crea la administradora; el resto relee el estado ya
 *    committeado y aplica las reglas anteriores.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/**
 * Clave determinística del advisory lock del bootstrap (forma de dos int32
 * de pg_advisory_xact_lock): classid = 20260725 (fecha de la feature,
 * constante del proyecto), objid = 1 (propósito: primera administradora).
 * Solo la usa este bootstrap; no bloquea ninguna otra operación del sistema.
 * Al ser transaccional (xact), PostgreSQL lo libera solo al terminar la
 * transacción, tanto en commit como en rollback o corte de conexión.
 */
export const ADMIN_BOOTSTRAP_LOCK_KEY = { classId: 20260725, objId: 1 } as const;

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

  // El hash es costoso (~100 ms): se calcula ANTES de la transacción para
  // mantener mínima la ventana en la que se retiene el lock.
  const passwordHash = await bcrypt.hash(password, 11);

  // Exclusión mutua DISTRIBUIDA: contar-y-crear se serializa entre procesos,
  // conexiones y réplicas dentro de una única transacción PostgreSQL.
  // pg_advisory_xact_lock bloquea hasta obtener el lock y lo libera
  // automáticamente al commit o rollback; con READ COMMITTED (default de
  // PostgreSQL), las consultas posteriores a la adquisición ven el estado
  // ya committeado por el proceso que tuvo el lock antes.
  const created = await prisma.$transaction(
    async (tx) => {
      // ::int obligatorio: Prisma parametriza números JS como bigint y la
      // firma de dos argumentos de pg_advisory_xact_lock es (int, int).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_BOOTSTRAP_LOCK_KEY.classId}::int, ${ADMIN_BOOTSTRAP_LOCK_KEY.objId}::int)`;

      // Relectura del estado DESPUÉS de adquirir el lock.
      const userCount = await tx.user.count();
      if (userCount > 0) {
        const existing = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing) {
          // Ejecución repetida con las mismas variables: no cambia
          // contraseña, rol ni ningún otro dato de la cuenta existente.
          return false;
        }
        throw new SeedConfigError(
          "Ya existen usuarios: este seed solo crea la PRIMERA administradora. " +
            "Las cuentas adicionales se crean desde /gestion/usuarios. No se creó ningún usuario.",
        );
      }

      await tx.user.create({
        data: {
          email,
          name: "Administradora",
          passwordHash,
          role: "ADMIN",
        },
      });
      await tx.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
      return true;
    },
    // maxWait/timeout holgados: los procesos que esperan el lock consumen
    // tiempo de transacción; 10 seeds serializados entran cómodos.
    { maxWait: 15_000, timeout: 60_000 },
  );

  if (!created) {
    log(`Seed administrativo: ${email} ya existe. Sin cambios.`);
    return { created: false };
  }
  log(`Administradora inicial creada: ${email}. Eliminá SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD.`);
  return { created: true };
}
