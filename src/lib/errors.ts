export type DomainErrorCode =
  | "SIN_SALDO"
  | "YA_REGISTRADA"
  | "YA_REVERTIDA"
  | "PACK_NO_APLICABLE"
  | "NO_AUTORIZADO"
  | "NO_ENCONTRADO"
  | "CREDENCIALES_INVALIDAS"
  | "DEMASIADOS_INTENTOS"
  | "DATO_INVALIDO";

/**
 * Error de negocio con código estable. Los server actions lo traducen a
 * mensajes en español para la UI; nunca expone detalles internos.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const DOMAIN_ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  SIN_SALDO: "La alumna no tiene clases disponibles en un pack vigente.",
  YA_REGISTRADA: "La asistencia ya estaba registrada para esa clase y fecha.",
  YA_REVERTIDA: "Esa operación ya fue revertida anteriormente.",
  PACK_NO_APLICABLE: "El pack no es aplicable a esta actividad o está vencido.",
  NO_AUTORIZADO: "No tenés permisos para realizar esta acción.",
  NO_ENCONTRADO: "No se encontró el registro solicitado.",
  CREDENCIALES_INVALIDAS: "Email o contraseña incorrectos.",
  DEMASIADOS_INTENTOS:
    "Demasiados intentos fallidos. Esperá unos minutos y volvé a intentar.",
  DATO_INVALIDO: "Los datos ingresados no son válidos.",
};
