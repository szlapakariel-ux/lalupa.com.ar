"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { cancelPackAction, correctionAction } from "@/server/actions/packs";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  buttonClass,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/** Correcciones y cancelación de un pack (solo ADMIN, siempre con motivo). */
export function CorrectionForm({
  studentId,
  studentPackId,
}: {
  studentId: string;
  studentPackId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    correctionAction,
    {},
  );
  const [cancelState, cancelFormAction] = useActionState<ActionState, FormData>(
    cancelPackAction,
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-terracota underline-offset-2 hover:underline"
      >
        Corregir / cancelar
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-borde bg-arena-claro/40 p-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="studentPackId" value={studentPackId} />
        <p className="text-xs text-tinta-suave">
          Una corrección crea un movimiento compensatorio nuevo; el historial
          nunca se edita ni se borra.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Tipo" htmlFor={`type-${studentPackId}`}>
            <select id={`type-${studentPackId}`} name="type" className={inputClass()}>
              <option value="CORRECTION_POS">Corrección + (suma clases)</option>
              <option value="CORRECTION_NEG">Corrección − (resta clases)</option>
              <option value="BONUS">Bonificación</option>
            </select>
          </Field>
          <Field label="Cantidad" htmlFor={`amount-${studentPackId}`}>
            <input
              id={`amount-${studentPackId}`}
              name="amount"
              type="number"
              min={1}
              max={200}
              defaultValue={1}
              required
              className={inputClass()}
            />
          </Field>
          <Field label="Motivo" htmlFor={`reason-${studentPackId}`} required>
            <input
              id={`reason-${studentPackId}`}
              name="reason"
              required
              minLength={3}
              maxLength={300}
              placeholder="Ej.: se marcó por error"
              className={inputClass()}
            />
          </Field>
        </div>
        <ErrorNotice message={state.error} />
        <SuccessNotice message={state.success} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="secondary" confirmText="¿Registrar esta corrección?">
            Registrar corrección
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={buttonClass("ghost")}
          >
            Cerrar
          </button>
        </div>
      </form>

      <form action={cancelFormAction} className="flex flex-wrap items-end gap-2 border-t border-borde pt-3">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="studentPackId" value={studentPackId} />
        <div className="min-w-48 flex-1">
          <Field label="Motivo de cancelación" htmlFor={`cancel-reason-${studentPackId}`}>
            <input
              id={`cancel-reason-${studentPackId}`}
              name="reason"
              maxLength={300}
              className={inputClass()}
            />
          </Field>
        </div>
        <SubmitButton
          variant="danger"
          confirmText="¿Cancelar el pack? El saldo restante se debita y queda registrado."
        >
          Cancelar pack
        </SubmitButton>
        <ErrorNotice message={cancelState.error} />
        <SuccessNotice message={cancelState.success} />
      </form>
    </div>
  );
}
