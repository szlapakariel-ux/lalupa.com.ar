/**
 * Único punto de manejo de fechas locales argentinas.
 * Las columnas @db.Date de Prisma guardan medianoche UTC del día calendario;
 * acá convertimos siempre de forma explícita para evitar corrimientos de zona.
 */

export const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" del día de hoy en hora argentina (independiente del TZ del server). */
export function todayYMD(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidYMD(value: string): boolean {
  if (!YMD_REGEX.test(value)) return false;
  const d = ymdToDate(value);
  return dateToYMD(d) === value;
}

/** Convierte "YYYY-MM-DD" al Date (medianoche UTC) que espera una columna @db.Date. */
export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Convierte el valor leído de una columna @db.Date (medianoche UTC) a "YYYY-MM-DD".
 * Acá toISOString es correcto porque el valor es exactamente medianoche UTC.
 */
export function dateToYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Suma días calendario a un "YYYY-MM-DD". */
export function addDaysYMD(ymd: string, days: number): string {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToYMD(d);
}

export type WeekdayName =
  | "LUNES"
  | "MARTES"
  | "MIERCOLES"
  | "JUEVES"
  | "VIERNES"
  | "SABADO"
  | "DOMINGO";

const WEEKDAY_BY_INDEX: WeekdayName[] = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
];

/** Día de la semana de un "YYYY-MM-DD" (fecha calendario, sin zona). */
export function weekdayOfYMD(ymd: string): WeekdayName {
  return WEEKDAY_BY_INDEX[ymdToDate(ymd).getUTCDay()];
}

/** Próxima fecha (>= fromYMD) que cae en el día de semana indicado. */
export function nextDateForWeekday(fromYMD: string, weekday: WeekdayName): string {
  const date = ymdToDate(fromYMD);
  const target = WEEKDAY_BY_INDEX.indexOf(weekday);
  const delta = (target - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return dateToYMD(date);
}

export const WEEKDAY_LABELS: Record<WeekdayName, string> = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};

/** "dd/mm/aaaa" para mostrar en la interfaz. */
export function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Fecha y hora completa en formato argentino. */
export function formatDateTimeAR(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Importe en pesos argentinos, ej: "$ 25.000". */
export function formatARS(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
