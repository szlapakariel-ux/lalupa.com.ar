"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { assignPackAction } from "@/server/actions/packs";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface ProductOption {
  id: string;
  name: string;
  classCount: number;
  referencePrice: number;
  validityDays: number;
}

export function PackForm({
  studentId,
  today,
  products,
}: {
  studentId: string;
  today: string;
  products: ProductOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    assignPackAction,
    {},
  );
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [withPayment, setWithPayment] = useState(true);
  const product = products.find((p) => p.id === productId);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="withPayment" value={String(withPayment)} />

      <Field label="Producto" htmlFor="productId" required>
        <select
          id="productId"
          name="productId"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className={inputClass()}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.classCount} clase{p.classCount === 1 ? "" : "s"} ·{" "}
              {p.validityDays} días
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Cantidad de clases"
          htmlFor="classCount"
          hint="Dejar vacío para usar la del producto."
        >
          <input
            id="classCount"
            name="classCount"
            type="number"
            min={1}
            max={200}
            placeholder={product ? String(product.classCount) : ""}
            className={inputClass()}
          />
        </Field>
        <Field label="Precio acordado (ARS)" htmlFor="agreedPrice" required>
          <input
            id="agreedPrice"
            name="agreedPrice"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={product?.referencePrice}
            key={productId}
            className={inputClass()}
          />
        </Field>
        <Field label="Fecha de inicio" htmlFor="startDateYMD" required>
          <input
            id="startDateYMD"
            name="startDateYMD"
            type="date"
            defaultValue={today}
            required
            className={inputClass()}
          />
        </Field>
        <Field label="Observación" htmlFor="notes">
          <input id="notes" name="notes" maxLength={500} className={inputClass()} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={withPayment}
          onChange={(e) => setWithPayment(e.target.checked)}
        />
        Registrar el pago ahora
      </label>
      <p className="text-xs text-tinta-suave">
        Si no registrás el pago, el pack queda cargado igual y podés
        registrarlo después desde Pagos (queda trazado como pendiente).
      </p>

      {withPayment && (
        <div className="grid gap-4 rounded-lg border border-borde bg-arena-claro/40 p-3 md:grid-cols-3">
          <Field label="Importe" htmlFor="paymentAmount">
            <input
              id="paymentAmount"
              name="paymentAmount"
              type="number"
              min={0}
              step="0.01"
              placeholder="Igual al precio"
              className={inputClass()}
            />
          </Field>
          <Field label="Método" htmlFor="paymentMethod">
            <select id="paymentMethod" name="paymentMethod" className={inputClass()}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="MERCADO_PAGO">Mercado Pago</option>
              <option value="OTRO">Otro</option>
            </select>
          </Field>
          <Field label="Estado" htmlFor="paymentStatus">
            <select id="paymentStatus" name="paymentStatus" defaultValue="PAGADO" className={inputClass()}>
              <option value="PAGADO">Pagado</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PARCIAL">Parcial</option>
              <option value="BONIFICADO">Bonificado</option>
            </select>
          </Field>
        </div>
      )}

      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton className="w-full" pendingText="Cargando…">
        Cargar pack
      </SubmitButton>
    </form>
  );
}
