import { describe, expect, it } from "vitest";
import { sanitizeMetadata } from "@/server/services/audit";

describe("sanitizeMetadata (auditoría sin secretos)", () => {
  it("descarta claves que puedan contener credenciales", () => {
    const clean = sanitizeMetadata({
      studentId: "abc",
      password: "no-debe-pasar",
      passwordHash: "tampoco",
      token: "nope",
      sessionSecret: "nope",
      contrasena: "nope",
      clave: "nope",
    }) as Record<string, unknown>;
    expect(clean).toEqual({ studentId: "abc" });
  });

  it("trunca strings largos", () => {
    const clean = sanitizeMetadata({ note: "x".repeat(1000) }) as Record<string, string>;
    expect(clean.note.length).toBe(300);
  });

  it("devuelve undefined si no hay metadatos", () => {
    expect(sanitizeMetadata(undefined)).toBeUndefined();
  });
});
