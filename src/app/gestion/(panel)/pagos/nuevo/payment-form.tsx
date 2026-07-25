"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { registerPaymentAction } from "@/server/actions/payments";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function PaymentForm({
  today,
  students,
  preselected,
}: {
  today: string;
  students: Array<{ id: string; label: string }>;
  preselected?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    registerPaymentAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Alumna" htmlFor="studentId" required>
        <select
          id="studentId"
          name="studentId"
          defaultValue={preselected ?? students[0]?.id}
          className={inputClass()}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Importe (ARS)" htmlFor="amount" required>
          <input
            id="amount"
            name="amount"
            type="number"
            min={0}
            step="0.01"
            required
            className={inputClass()}
          />
        </Field>
        <Field label="Fecha" htmlFor="dateYMD" required>
          <input
            id="dateYMD"
            name="dateYMD"
            type="date"
            defaultValue={today}
            required
            className={inputClass()}
          />
        </Field>
        <Field label="Método" htmlFor="method" required>
          <select id="method" name="method" className={inputClass()}>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="MERCADO_PAGO">Mercado Pago</option>
            <option value="OTRO">Otro</option>
          </select>
        </Field>
        <Field label="Estado" htmlFor="status" required>
          <select id="status" name="status" defaultValue="PAGADO" className={inputClass()}>
            <option value="PAGADO">Pagado</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="BONIFICADO">Bonificado</option>
          </select>
        </Field>
        <Field label="Concepto" htmlFor="concept">
          <input
            id="concept"
            name="concept"
            maxLength={200}
            placeholder="Ej.: Pack x4 julio"
            className={inputClass()}
          />
        </Field>
        <Field label="Referencia (opcional)" htmlFor="reference">
          <input id="reference" name="reference" maxLength={120} className={inputClass()} />
        </Field>
      </div>
      <Field label="Observaciones" htmlFor="notes">
        <textarea id="notes" name="notes" rows={2} maxLength={500} className={inputClass()} />
      </Field>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton className="w-full">Registrar pago</SubmitButton>
    </form>
  );
}
