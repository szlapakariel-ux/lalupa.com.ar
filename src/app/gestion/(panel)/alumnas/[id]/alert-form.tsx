"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import {
  createAlertAction,
  toggleAlertAction,
} from "@/server/actions/students";
import {
  ALERT_TYPE_LABEL,
  Card,
  ErrorNotice,
  Field,
  SuccessNotice,
  buttonClass,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function AlertForm({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    createAlertAction,
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("secondary")}
      >
        + Agregar alerta
      </button>
    );
  }

  return (
    <Card>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="studentId" value={studentId} />
        <p className="text-xs text-tinta-suave">
          Cargá solo lo mínimo necesario para dar la clase con seguridad. Esto
          no es una historia clínica y su acceso queda registrado.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tipo" htmlFor="alert-type" required>
            <select id="alert-type" name="type" required className={inputClass()}>
              {Object.entries(ALERT_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibilidad" htmlFor="alert-visibility" required>
            <select
              id="alert-visibility"
              name="visibility"
              defaultValue="TODOS"
              className={inputClass()}
            >
              <option value="TODOS">Todo el equipo</option>
              <option value="SOLO_ADMIN">Solo administradoras</option>
            </select>
          </Field>
        </div>
        <Field label="Descripción breve" htmlFor="alert-title" required>
          <input
            id="alert-title"
            name="title"
            required
            maxLength={120}
            placeholder="Ej.: Alergia al maní"
            className={inputClass()}
          />
        </Field>
        <Field label="Indicación operativa" htmlFor="alert-instruction">
          <input
            id="alert-instruction"
            name="instruction"
            maxLength={300}
            placeholder="Ej.: No ofrecer snacks con frutos secos"
            className={inputClass()}
          />
        </Field>
        <ErrorNotice message={state.error} />
        <SuccessNotice message={state.success} />
        <div className="flex gap-2">
          <SubmitButton>Guardar alerta</SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={buttonClass("ghost")}
          >
            Cerrar
          </button>
        </div>
      </form>
    </Card>
  );
}

export function AlertToggle({
  alertId,
  studentId,
  active,
}: {
  alertId: string;
  studentId: string;
  active: boolean;
}) {
  const [, formAction] = useActionState<ActionState, FormData>(
    toggleAlertAction,
    {},
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="alertId" value={alertId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="active" value={String(!active)} />
      <SubmitButton
        variant={active ? "ghost" : "secondary"}
        pendingText="…"
        confirmText={
          active ? "¿Desactivar esta alerta? Dejará de mostrarse en la ficha." : undefined
        }
      >
        {active ? "Desactivar" : "Reactivar"}
      </SubmitButton>
    </form>
  );
}
