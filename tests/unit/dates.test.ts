import { describe, expect, it } from "vitest";
import {
  addDaysYMD,
  dateToYMD,
  formatARS,
  formatYMD,
  isValidYMD,
  todayYMD,
  weekdayOfYMD,
  ymdToDate,
} from "@/lib/dates";

describe("todayYMD (fecha local argentina)", () => {
  it("resuelve el borde de medianoche: 02:00 UTC es el día anterior en AR (UTC-3)", () => {
    expect(todayYMD(new Date("2026-07-25T02:00:00Z"))).toBe("2026-07-24");
  });
  it("después de las 03:00 UTC ya es el mismo día en AR", () => {
    expect(todayYMD(new Date("2026-07-25T03:00:00Z"))).toBe("2026-07-25");
    expect(todayYMD(new Date("2026-07-25T23:00:00Z"))).toBe("2026-07-25");
  });
});

describe("conversiones YMD ↔ Date (columnas @db.Date)", () => {
  it("ida y vuelta sin corrimientos", () => {
    expect(dateToYMD(ymdToDate("2026-07-25"))).toBe("2026-07-25");
    expect(ymdToDate("2026-07-25").toISOString()).toBe("2026-07-25T00:00:00.000Z");
  });
});

describe("addDaysYMD", () => {
  it("suma días cruzando meses y años", () => {
    expect(addDaysYMD("2026-07-25", 30)).toBe("2026-08-24");
    expect(addDaysYMD("2026-12-20", 15)).toBe("2027-01-04");
  });
});

describe("weekdayOfYMD", () => {
  it("calcula el día de semana calendario", () => {
    expect(weekdayOfYMD("2026-07-25")).toBe("SABADO");
    expect(weekdayOfYMD("2026-07-27")).toBe("LUNES");
  });
});

describe("isValidYMD", () => {
  it("acepta fechas reales y rechaza inválidas", () => {
    expect(isValidYMD("2026-07-25")).toBe(true);
    expect(isValidYMD("2026-02-30")).toBe(false);
    expect(isValidYMD("25/07/2026")).toBe(false);
    expect(isValidYMD("")).toBe(false);
  });
});

describe("formatos argentinos", () => {
  it("fecha dd/mm/aaaa", () => {
    expect(formatYMD("2026-07-25")).toBe("25/07/2026");
  });
  it("moneda ARS", () => {
    const s = formatARS(40000);
    expect(s).toContain("40.000");
    expect(s).toContain("$");
  });
});
