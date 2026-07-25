"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { saveActivityAction } from "@/server/actions/catalog";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WEEKDAY_LABELS } from "@/lib/dates";

interface ActivityValues {
  id: string;
  name: string;
  description: string | null;
  teacherId: string | null;
  weekday: string;
  startTime: string;
  durationMin: number;
  capacity: number | null;
  active: boolean;
}

export function ActivityForm({
  activity,
  teachers,
}: {
  activity?: ActivityValues;
  teachers: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveActivityAction,
    {},
  );
  const prefix = activity?.id ?? "new";

  return (
    <form action={formAction} className="space-y-3">
      {activity && <input type="hidden" name="activityId" value={activity.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nombre" htmlFor={`${prefix}-name`} required>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={80}
            defaultValue={activity?.name}
            className={inputClass()}
          />
        </Field>
        <Field label="Profesora" htmlFor={`${prefix}-teacher`}>
          <select
            id={`${prefix}-teacher`}
            name="teacherId"
            defaultValue={activity?.teacherId ?? ""}
            className={inputClass()}
          >
            <option value="">Sin asignar</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Día" htmlFor={`${prefix}-weekday`} required>
          <select
            id={`${prefix}-weekday`}
            name="weekday"
            defaultValue={activity?.weekday ?? "LUNES"}
            className={inputClass()}
          >
            {Object.entries(WEEKDAY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Horario (HH:MM)" htmlFor={`${prefix}-startTime`} required>
          <input
            id={`${prefix}-startTime`}
            name="startTime"
            type="time"
            required
            defaultValue={activity?.startTime ?? "18:00"}
            className={inputClass()}
          />
        </Field>
        <Field label="Duración (minutos)" htmlFor={`${prefix}-duration`} required>
          <input
            id={`${prefix}-duration`}
            name="durationMin"
            type="number"
            min={15}
            max={480}
            required
            defaultValue={activity?.durationMin ?? 60}
            className={inputClass()}
          />
        </Field>
        <Field label="Cupo (opcional)" htmlFor={`${prefix}-capacity`}>
          <input
            id={`${prefix}-capacity`}
            name="capacity"
            type="number"
            min={1}
            max={200}
            defaultValue={activity?.capacity ?? ""}
            className={inputClass()}
          />
        </Field>
      </div>
      <Field label="Descripción breve" htmlFor={`${prefix}-description`}>
        <input
          id={`${prefix}-description`}
          name="description"
          maxLength={300}
          defaultValue={activity?.description ?? ""}
          className={inputClass()}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={activity?.active ?? true}
        />
        Actividad activa
      </label>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton>{activity ? "Guardar cambios" : "Crear actividad"}</SubmitButton>
    </form>
  );
}
