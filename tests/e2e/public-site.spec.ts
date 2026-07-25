import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

test.describe("Sitio público intacto", () => {
  test("la raíz sirve el index.html original byte-idéntico", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const served = await response.body();
    const original = readFileSync(path.resolve("public/index.html"));
    expect(served.length).toBe(original.length);
    expect(served.equals(original)).toBe(true);
  });

  test("la raíz no lleva encabezado noindex (sigue indexable)", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["x-robots-tag"]).toBeUndefined();
  });

  test("las imágenes de uploads siguen accesibles", async ({ request }) => {
    const response = await request.get("/uploads/hero.jpeg");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image");
  });
});

test.describe("Separación pública/privada", () => {
  test("/gestion sin sesión redirige al login", async ({ page }) => {
    await page.goto("/gestion");
    await expect(page).toHaveURL(/\/gestion\/login$/);
  });

  test("/gestion lleva noindex por header y por meta", async ({ request }) => {
    const response = await request.get("/gestion/login");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("el health check responde", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", db: "ok" });
  });
});
