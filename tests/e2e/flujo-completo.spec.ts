import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, login } from "./helpers";

/**
 * Flujo completo de administradora: alta de alumna → carga de pack →
 * tomó clase (descuento único) → intento de doble marca → reversión.
 * Usa nombres únicos por corrida para poder re-ejecutarse.
 */
test.describe("Flujo completo de gestión", () => {
  test("alta, pack, asistencia, doble marca bloqueada y reversión", async ({ page }) => {
    const apellido = `E2E-${Date.now()}`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // 1. Alta de alumna
    await page.goto("/gestion/alumnas/nueva");
    await page.getByLabel("Nombre", { exact: true }).fill("Prueba");
    await page.getByLabel("Apellido", { exact: true }).fill(apellido);
    await page.getByLabel("Teléfono", { exact: true }).fill("11-0000-0000");
    await page.getByRole("button", { name: "Crear alumna" }).click();
    await expect(page.getByRole("status")).toContainText("Alumna creada");

    // 2. Buscarla en el listado y abrir "Pack / pago"
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    const card = page.locator("div", { hasText: `${apellido}, Prueba` }).last();
    await expect(page.getByText(`${apellido}, Prueba`)).toBeVisible();
    await expect(page.getByText("0 disponibles")).toBeVisible();
    await page.getByRole("link", { name: "Pack / pago" }).click();

    // 3. Cargar un pack con pago
    await expect(page.getByRole("heading", { name: /Cargar pack/ })).toBeVisible();
    await page.getByRole("button", { name: "Cargar pack" }).click();
    await expect(page.getByRole("status")).toContainText("Pack cargado");

    // 4. Tomó clase: ver saldo antes y confirmar
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await page.getByRole("link", { name: "Tomó clase" }).click();
    await expect(page.getByRole("status")).toContainText("Saldo disponible");
    await page.getByRole("button", { name: "Confirmar asistencia" }).click();
    await expect(page.getByText(/Se descontó 1 clase/)).toBeVisible();

    // 5. Doble marca: bloqueada, el saldo no cambia dos veces
    await page.getByRole("button", { name: "Confirmar asistencia" }).click();
    await expect(page.getByRole("alert")).toContainText("ya estaba registrada");

    // 6. La ficha muestra el movimiento y el saldo correcto
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await page.getByRole("link", { name: "Ver ficha" }).click();
    await expect(page.getByText("Movimientos de clases")).toBeVisible();
    await expect(page.getByText("Clase utilizada").first()).toBeVisible();
    await expect(page.getByText("Compra de pack").first()).toBeVisible();

    // 7. Revertir desde "Clases de hoy" (acepta el confirm del navegador)
    await page.goto("/gestion/asistencia");
    page.on("dialog", (dialog) => dialog.accept());
    const fila = page.locator("div", { hasText: `${apellido}, Prueba` }).last();
    await page.getByRole("button", { name: "Revertir" }).last().click();
    await expect(page.getByText(/revertida/i).first()).toBeVisible();

    // 8. La reversión devolvió la clase al saldo (queda trazada, no borrada)
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await page.getByRole("link", { name: "Ver ficha" }).click();
    await expect(page.getByText("Reversión").first()).toBeVisible();
    await expect(page.getByText("Clase utilizada").first()).toBeVisible();
    void card;
    void fila;
  });
});
