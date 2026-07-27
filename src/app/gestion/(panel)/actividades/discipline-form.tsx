"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { saveDisciplineAction } from "@/server/actions/catalog";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface DisciplineValues {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export function DisciplineForm({ discipline }: { discipline?: DisciplineValues }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveDisciplineAction,
    {},
  );
  const prefix = discipline?.id ?? "new-disc";

  return (
    <form action={formAction} className="space-y-3">
      {discipline && (
        <input type="hidden" name="disciplineId" value={discipline.id} />
      )}
      <Field label="Nombre" htmlFor={`${prefix}-name`} required>
        <input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={80}
          defaultValue={discipline?.name}
          placeholder="Ej.: Ilustración y collage"
          className={inputClass()}
        />
      </Field>
      <Field label="Descripción breve" htmlFor={`${prefix}-description`}>
        <input
          id={`${prefix}-description`}
          name="description"
          maxLength={300}
          defaultValue={discipline?.description ?? ""}
          className={inputClass()}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={discipline?.active ?? true}
        />
        Disciplina activa
      </label>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton>
        {discipline ? "Guardar disciplina" : "Crear disciplina"}
      </SubmitButton>
    </form>
  );
}
