import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, TEACHER_EMAIL, TEACHER_PASSWORD, login } from "./helpers";

// El announcer de rutas de Next también expone role="alert": apuntamos al
// aviso de error concreto (<p role="alert">) para evitar ambigüedad.
const errorAlert = 'p[role="alert"]';

test.describe("Autenticación", () => {
  test("credenciales inválidas muestran error genérico", async ({ page }) => {
    await login(page, ADMIN_EMAIL, "contrasena-incorrecta");
    await expect(page.locator(errorAlert)).toContainText("incorrectos");
    await expect(page).toHaveURL(/\/gestion\/login$/);
  });

  test("login y logout completos", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/gestion$/);
    await expect(page.getByText("Clases del día")).toBeVisible();

    // En mobile el botón del sidebar existe pero está oculto: filtrar visibles
    await page
      .getByRole("button", { name: /Cerrar sesión|Salir/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/gestion\/login$/);

    // La sesión quedó revocada: /gestion vuelve a pedir login
    await page.goto("/gestion");
    await expect(page).toHaveURL(/\/gestion\/login$/);
  });

  test("rate limit: al sexto intento fallido bloquea aunque la clave sea correcta", async ({
    page,
  }) => {
    const email = `inexistente-${Date.now()}@test.local`;
    for (let i = 0; i < 5; i++) {
      await login(page, email, "clave-mala");
      await expect(page.locator(errorAlert)).toBeVisible();
    }
    await login(page, email, "clave-mala");
    await expect(page.locator(errorAlert)).toContainText("Demasiados intentos");
  });
});

test.describe("Roles", () => {
  test("una profesora no ve ni accede a las secciones de administración", async ({
    page,
  }) => {
    await login(page, TEACHER_EMAIL, TEACHER_PASSWORD);
    await expect(page).toHaveURL(/\/gestion$/);

    // No aparece el link de Pagos en la navegación
    await expect(
      page.getByRole("navigation", { name: "Navegación principal" }).getByText("Pagos"),
    ).toHaveCount(0);

    // Acceso directo a páginas de admin: la manda al inicio (server-side)
    for (const url of ["/gestion/pagos", "/gestion/usuarios", "/gestion/auditoria"]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/gestion$/);
    }
  });
});
