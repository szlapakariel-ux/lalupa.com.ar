import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSUMPTION,
  consumesClass,
  isPackEligible,
  isPackExpired,
  pickPackFIFO,
  sumBalance,
  type PackForSelection,
} from "@/lib/policy";

describe("consumesClass (reglas de cancelación)", () => {
  it("aplica las reglas predeterminadas del negocio", () => {
    expect(consumesClass(DEFAULT_CONSUMPTION, "PRESENTE")).toBe(true);
    expect(consumesClass(DEFAULT_CONSUMPTION, "CANCELO_A_TIEMPO")).toBe(false);
    expect(consumesClass(DEFAULT_CONSUMPTION, "CANCELO_TARDE")).toBe(true);
    expect(consumesClass(DEFAULT_CONSUMPTION, "AUSENTE")).toBe(true);
    expect(consumesClass(DEFAULT_CONSUMPTION, "CLASE_PRUEBA")).toBe(false);
  });

  it("respeta la configuración modificada", () => {
    const custom = {
      ...DEFAULT_CONSUMPTION,
      trialConsumes: true,
      absentConsumes: false,
    };
    expect(consumesClass(custom, "CLASE_PRUEBA")).toBe(true);
    expect(consumesClass(custom, "AUSENTE")).toBe(false);
  });
});

describe("sumBalance (saldo derivado del libro)", () => {
  it("suma los deltas de los movimientos", () => {
    expect(sumBalance([])).toBe(0);
    expect(sumBalance([{ delta: 4 }, { delta: -1 }, { delta: -1 }, { delta: 1 }])).toBe(3);
  });

  it("puede quedar negativo (solo por acción administrativa)", () => {
    expect(sumBalance([{ delta: 1 }, { delta: -2 }])).toBe(-1);
  });
});

function pack(overrides: Partial<PackForSelection>): PackForSelection {
  return {
    id: "p1",
    status: "ACTIVO",
    expiresAtYMD: "2026-08-31",
    startDateYMD: "2026-07-01",
    createdAt: new Date("2026-07-01T12:00:00Z"),
    productActivityId: null,
    balance: 3,
    ...overrides,
  };
}

describe("isPackEligible (vigencia y compatibilidad)", () => {
  const date = "2026-07-25";
  it("acepta un pack activo, vigente, con saldo y actividad compatible", () => {
    expect(isPackEligible(pack({}), "act1", date)).toBe(true);
    expect(isPackEligible(pack({ productActivityId: "act1" }), "act1", date)).toBe(true);
  });
  it("rechaza vencidos, agotados, cancelados, sin saldo o de otra actividad", () => {
    expect(isPackEligible(pack({ expiresAtYMD: "2026-07-24" }), "act1", date)).toBe(false);
    expect(isPackEligible(pack({ status: "AGOTADO" }), "act1", date)).toBe(false);
    expect(isPackEligible(pack({ status: "VENCIDO" }), "act1", date)).toBe(false);
    expect(isPackEligible(pack({ status: "CANCELADO" }), "act1", date)).toBe(false);
    expect(isPackEligible(pack({ balance: 0 }), "act1", date)).toBe(false);
    expect(isPackEligible(pack({ productActivityId: "otra" }), "act1", date)).toBe(false);
  });
  it("rechaza packs que todavía no empezaron", () => {
    expect(isPackEligible(pack({ startDateYMD: "2026-07-26" }), "act1", date)).toBe(false);
  });
  it("acepta el pack el mismo día del vencimiento", () => {
    expect(isPackEligible(pack({ expiresAtYMD: date }), "act1", date)).toBe(true);
  });
});

describe("pickPackFIFO (elección del pack a debitar)", () => {
  const date = "2026-07-25";
  it("elige el que vence antes", () => {
    const a = pack({ id: "a", expiresAtYMD: "2026-09-01" });
    const b = pack({ id: "b", expiresAtYMD: "2026-08-01" });
    expect(pickPackFIFO([a, b], "act1", date)?.id).toBe("b");
  });
  it("a igual vencimiento, el comprado antes", () => {
    const a = pack({ id: "a", createdAt: new Date("2026-07-02T00:00:00Z") });
    const b = pack({ id: "b", createdAt: new Date("2026-07-01T00:00:00Z") });
    expect(pickPackFIFO([a, b], "act1", date)?.id).toBe("b");
  });
  it("ignora los no elegibles y devuelve null si no hay ninguno", () => {
    const vencido = pack({ id: "v", expiresAtYMD: "2026-07-01" });
    const otra = pack({ id: "o", productActivityId: "otraAct" });
    expect(pickPackFIFO([vencido, otra], "act1", date)).toBeNull();
  });
});

describe("isPackExpired", () => {
  it("compara fechas calendario", () => {
    expect(isPackExpired("2026-07-24", "2026-07-25")).toBe(true);
    expect(isPackExpired("2026-07-25", "2026-07-25")).toBe(false);
    expect(isPackExpired("2026-07-26", "2026-07-25")).toBe(false);
  });
});
