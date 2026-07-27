import { DOMAIN_ERROR_MESSAGES, DYNAMIC_MESSAGE_CODES, DomainError } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { isRedirectError } from "next/dist/client/components/redirect-error";

/**
 * Envuelve una server action: los errores de dominio vuelven como mensaje
 * en español; cualquier otro error se loguea sin datos sensibles y devuelve
 * un mensaje genérico.
 */
export async function runAction(
  fn: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof DomainError) {
      // Algunos códigos llevan un mensaje específico armado en el servicio
      // (ej: el día correcto del horario); el resto usa el texto genérico.
      const dynamic = DYNAMIC_MESSAGE_CODES.has(e.code) && e.message;
      return { error: dynamic ? e.message : DOMAIN_ERROR_MESSAGES[e.code] };
    }
    console.error("[accion] error inesperado:", e instanceof Error ? e.message : e);
    return { error: "Ocurrió un error inesperado. Volvé a intentar." };
  }
}

export function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optional(value: string): string | undefined {
  return value === "" ? undefined : value;
}
