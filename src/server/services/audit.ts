import type { Prisma, AuditResult } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

/** Valores permitidos en metadatos de auditoría: solo primitivos cortos. */
export type AuditMetadata = Record<string, string | number | boolean | null>;

const FORBIDDEN_KEYS = /pass|token|secret|hash|clave|contrase/i;
const MAX_STRING = 300;

/**
 * Sanitiza metadatos antes de persistirlos: descarta claves sospechosas de
 * contener secretos y trunca strings largos. Nunca pasar acá contenido de
 * alertas médicas ni credenciales.
 */
export function sanitizeMetadata(
  metadata: AuditMetadata | undefined,
): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    clean[key] =
      typeof value === "string" && value.length > MAX_STRING
        ? value.slice(0, MAX_STRING)
        : value;
  }
  return clean;
}

export interface AuditInput {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  result?: AuditResult;
  metadata?: AuditMetadata;
  ip?: string | null;
}

/** Registra un evento de auditoría dentro de la transacción dada. */
export async function audit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      result: input.result ?? "OK",
      metadata: sanitizeMetadata(input.metadata),
      ip: input.ip ?? null,
    },
  });
}
