/**
 * Reglas de negocio PURAS (sin base de datos ni framework).
 * Los tipos son uniones de strings estructuralmente idénticas a los enums
 * de Prisma, para que este módulo sea testeable sin generar el cliente.
 */

export type AttendanceStatusName =
  | "PRESENTE"
  | "CANCELO_A_TIEMPO"
  | "CANCELO_TARDE"
  | "AUSENTE"
  | "CLASE_PRUEBA";

export type PackStatusName = "ACTIVO" | "AGOTADO" | "VENCIDO" | "CANCELADO";

export interface ConsumptionSettings {
  presentConsumes: boolean;
  earlyCancelConsumes: boolean;
  lateCancelConsumes: boolean;
  absentConsumes: boolean;
  trialConsumes: boolean;
}

/** Reglas predeterminadas del negocio (modificables desde Configuración). */
export const DEFAULT_CONSUMPTION: ConsumptionSettings = {
  presentConsumes: true,
  earlyCancelConsumes: false,
  lateCancelConsumes: true,
  absentConsumes: true,
  trialConsumes: false,
};

/** ¿Este estado de asistencia consume una clase del pack, según la configuración? */
export function consumesClass(
  settings: ConsumptionSettings,
  status: AttendanceStatusName,
): boolean {
  switch (status) {
    case "PRESENTE":
      return settings.presentConsumes;
    case "CANCELO_A_TIEMPO":
      return settings.earlyCancelConsumes;
    case "CANCELO_TARDE":
      return settings.lateCancelConsumes;
    case "AUSENTE":
      return settings.absentConsumes;
    case "CLASE_PRUEBA":
      return settings.trialConsumes;
  }
}

/** Saldo = suma de deltas de los movimientos. Nunca un contador editable. */
export function sumBalance(movements: ReadonlyArray<{ delta: number }>): number {
  return movements.reduce((acc, m) => acc + m.delta, 0);
}

export interface PackForSelection {
  id: string;
  status: PackStatusName;
  /** "YYYY-MM-DD" */
  expiresAtYMD: string;
  /** "YYYY-MM-DD" */
  startDateYMD: string;
  createdAt: Date;
  /** null = el producto aplica a TODAS las disciplinas */
  productDisciplineId: string | null;
  balance: number;
}

/**
 * Un pack es elegible para una clase de una disciplina si está activo, con
 * saldo, vigente a la fecha, y es genérico (disciplina null) o pertenece a
 * ESA disciplina. El horario concreto (Activity) ya no importa: cualquier
 * horario de la disciplina sirve.
 */
export function isPackEligible(
  pack: PackForSelection,
  disciplineId: string,
  dateYMD: string,
): boolean {
  return (
    pack.status === "ACTIVO" &&
    pack.balance > 0 &&
    pack.expiresAtYMD >= dateYMD &&
    pack.startDateYMD <= dateYMD &&
    (pack.productDisciplineId === null || pack.productDisciplineId === disciplineId)
  );
}

/**
 * POLÍTICA VIGENTE (preexistente, se conserva sin cambios) para elegir el
 * pack a debitar cuando hay varios compatibles: entre los elegibles,
 * primero el que vence antes; a igual vencimiento, el comprado antes
 * (FIFO por vencimiento). No distingue packs genéricos de específicos.
 */
export function pickPackFIFO(
  packs: ReadonlyArray<PackForSelection>,
  disciplineId: string,
  dateYMD: string,
): PackForSelection | null {
  const eligible = packs.filter((p) => isPackEligible(p, disciplineId, dateYMD));
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) =>
      a.expiresAtYMD.localeCompare(b.expiresAtYMD) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )[0];
}

/** ¿El pack está vencido a la fecha dada? (independiente del estado guardado) */
export function isPackExpired(expiresAtYMD: string, todayYMD: string): boolean {
  return expiresAtYMD < todayYMD;
}
