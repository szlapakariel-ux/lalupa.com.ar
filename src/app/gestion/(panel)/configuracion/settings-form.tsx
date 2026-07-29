"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { updateSettingsAction } from "@/server/actions/settings";
import { ErrorNotice, Field, SuccessNotice, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface SettingsValues {
  presentConsumes: boolean;
  earlyCancelConsumes: boolean;
  lateCancelConsumes: boolean;
  absentConsumes: boolean;
  trialConsumes: boolean;
  earlyCancelHours: number;
}

const RULES: Array<{ name: keyof SettingsValues & string; label: string }> = [
  { name: "presentConsumes", label: "Presente consume una clase" },
  { name: "earlyCancelConsumes", label: "Cancelación anticipada consume" },
  { name: "lateCancelConsumes", label: "Cancelación tardía consume" },
  { name: "absentConsumes", label: "Ausencia sin aviso consume" },
  { name: "trialConsumes", label: "Clase de prueba consume" },
];

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateSettingsAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        {RULES.map((rule) => (
          <label
            key={rule.name}
            className="flex items-center justify-between gap-3 rounded-lg border border-borde px-3 py-2.5 text-sm"
          >
            {rule.label}
            <input
              type="checkbox"
              name={rule.name}
              defaultChecked={Boolean(settings[rule.name])}
              className="h-5 w-5"
            />
          </label>
        ))}
      </div>
      <Field
        label="Horas de anticipación para cancelar a tiempo"
        htmlFor="earlyCancelHours"
        hint="Valor de referencia para el equipo; el estado lo elige quien registra."
      >
        <input
          id="earlyCancelHours"
          name="earlyCancelHours"
          type="number"
          min={0}
          max={168}
          defaultValue={settings.earlyCancelHours}
          className={inputClass("max-w-32")}
        />
      </Field>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton>Guardar configuración</SubmitButton>
    </form>
  );
}
