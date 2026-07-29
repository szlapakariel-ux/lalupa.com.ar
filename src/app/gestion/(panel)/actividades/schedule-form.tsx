"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { saveScheduleAction } from "@/server/actions/catalog";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WEEKDAY_LABELS } from "@/lib/dates";

interface ScheduleValues {
  id: string;
  weekday: string;
  startTime: string;
  durationMin: number;
  capacity: number | null;
  teacherId: string | null;
  active: boolean;
  hasHistory: boolean;
}

export function ScheduleForm({
  disciplineId,
  schedule,
  teachers,
}: {
  disciplineId: string;
  schedule?: ScheduleValues;
  teachers: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveScheduleAction,
    {},
  );
  const prefix = schedule?.id ?? `new-${disciplineId}`;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="disciplineId" value={disciplineId} />
      {schedule && <input type="hidden" name="activityId" value={schedule.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Día" htmlFor={`${prefix}-weekday`} required>
          <select
            id={`${prefix}-weekday`}
            name="weekday"
            defaultValue={schedule?.weekday ?? "LUNES"}
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
            defaultValue={schedule?.startTime ?? "18:00"}
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
            defaultValue={schedule?.durationMin ?? 60}
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
            defaultValue={schedule?.capacity ?? ""}
            className={inputClass()}
          />
        </Field>
        <Field label="Profesora" htmlFor={`${prefix}-teacher`}>
          <select
            id={`${prefix}-teacher`}
            name="teacherId"
            defaultValue={schedule?.teacherId ?? ""}
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
      </div>
      {schedule?.hasHistory && (
        <p className="rounded-lg bg-arena-claro/60 px-3 py-2 text-xs text-tinta-suave">
          Este horario ya tiene asistencias. Si cambiás el día o la hora se
          crea un horario nuevo y este queda desactivado; el historial no se
          modifica.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={schedule?.active ?? true}
        />
        Horario activo
      </label>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton>{schedule ? "Guardar horario" : "Agregar horario"}</SubmitButton>
    </form>
  );
}
