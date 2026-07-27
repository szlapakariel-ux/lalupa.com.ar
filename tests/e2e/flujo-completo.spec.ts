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
    // Esperar el redirect post-login antes de navegar (evita carrera con la cookie)
    await expect(page).toHaveURL(/\/gestion$/);

    // 1. Alta de alumna
    await page.goto("/gestion/alumnas/nueva");
    // Los campos requeridos exponen el asterisco en su label accesible
    await page.getByLabel("Nombre *").fill("Prueba");
    await page.getByLabel("Apellido *").fill(apellido);
    await page.getByLabel("Teléfono", { exact: true }).fill("11-0000-0000");
    await page.getByRole("button", { name: "Crear alumna" }).click();
    await expect(page.getByRole("status")).toContainText("Alumna creada");

    // 2. Inscribirla en la disciplina Yoga desde su ficha (no consume clases)
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await expect(page.getByText(`${apellido}, Prueba`)).toBeVisible();
    await expect(page.getByText("0 disponibles")).toBeVisible();
    await page.getByRole("link", { name: "Ver ficha" }).click();
    await expect(
      page.getByRole("heading", { name: "Actividades e inscripciones" }),
    ).toBeVisible();
    await page.getByLabel("Disciplina", { exact: true }).selectOption({ label: "Yoga" });
    await page.getByRole("button", { name: "Inscribir" }).click();
    await expect(page.getByRole("status")).toContainText("Inscripción creada");
    await expect(
      page.getByText("Horario habitual pendiente de confirmación"),
    ).toBeVisible();

    // 3. Cargar un pack con pago (Pack x4 genérico: saldo tras una clase)
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await page.getByRole("link", { name: "Pack / pago" }).click();
    await expect(page.getByRole("heading", { name: /Cargar pack/ })).toBeVisible();
    const producto = page.getByLabel("Producto *");
    const packX4 = await producto
      .locator("option", { hasText: /^Pack x4 — 4 clases/ })
      .first()
      .getAttribute("value");
    await producto.selectOption(packX4!);
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
    await expect(page.locator('p[role="alert"]')).toContainText("ya estaba registrada");

    // 6. La ficha muestra el movimiento y el saldo correcto
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await page.getByRole("link", { name: "Ver ficha" }).click();
    await expect(page.getByText("Movimientos de clases")).toBeVisible();
    await expect(page.getByText("Clase utilizada").first()).toBeVisible();
    await expect(page.getByText("Compra de pack").first()).toBeVisible();

    // 7. Revertir desde "Clases de hoy": elegir la disciplina Yoga y su
    //    horario de hoy (acepta el confirm del navegador)
    await page.goto("/gestion/asistencia");
    await page.getByLabel("Disciplina", { exact: true }).selectOption({ label: "Yoga" });
    await page.getByRole("button", { name: "Ver clase" }).click();
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Revertir" }).last().click();
    await expect(page.getByText(/revertida/i).first()).toBeVisible();

    // 8. La reversión devolvió la clase al saldo (queda trazada, no borrada)
    await page.goto(`/gestion/alumnas?q=${apellido}`);
    await page.getByRole("link", { name: "Ver ficha" }).click();
    await expect(page.getByText("Reversión").first()).toBeVisible();
    await expect(page.getByText("Clase utilizada").first()).toBeVisible();
  });
});
