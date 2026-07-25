import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@lalupa.local";
export const ADMIN_PASSWORD = "lupa-admin-dev";
export const TEACHER_EMAIL = "profe@lalupa.local";
export const TEACHER_PASSWORD = "lupa-profe-dev";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/gestion/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}
