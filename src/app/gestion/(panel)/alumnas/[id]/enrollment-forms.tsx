"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import {
  enrollStudentAction,
  setPreferredScheduleAction,
  toggleEnrollmentAction,
} from "@/server/actions/enrollments";
import { ErrorNotice, SuccessNotice, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export interface ScheduleOption {
  id: string;
  label: string;
}

/** Inscribir a la alumna en una disciplina (solo ADMIN; no consume clases). */
export function EnrollForm({
  studentId,
  disciplines,
}: {
  studentId: string;
  disciplines: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    enrollStudentAction,
    {},
  );
  if (disciplines.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        Ya está inscripta en todas las disciplinas activas.
      </p>
    );
  }
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="enroll-discipline">
          Disciplina
        </label>
        <select
          id="enroll-discipline"
          name="disciplineId"
          className={inputClass("flex-1")}
        >
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <SubmitButton pendingText="Inscribiendo…">Inscribir</SubmitButton>
      </div>
      <p className="text-xs text-tinta-suave">
        La inscripción no consume clases; el horario habitual queda pendiente
        hasta que se asigne.
      </p>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
    </form>
  );
}

/** Asignar o cambiar el horario habitual (no consume clases). */
export function PreferredScheduleForm({
  enrollmentId,
  studentId,
  current,
  options,
  canClear,
}: {
  enrollmentId: string;
  studentId: string;
  current: string | null;
  options: ScheduleOption[];
  canClear: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setPreferredScheduleAction,
    {},
  );
  const [value, setValue] = useState(current ?? "");

  if (options.length === 0 && !canClear) {
    return (
      <p className="text-xs text-tinta-suave">
        No tenés horarios propios activos en esta disciplina para asignar.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`preferred-${enrollmentId}`}>
          Horario habitual
        </label>
        <select
          id={`preferred-${enrollmentId}`}
          name="activityId"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass("flex-1")}
        >
          {canClear && <option value="">Sin horario habitual (pendiente)</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <SubmitButton variant="secondary" pendingText="Guardando…">
          Guardar horario
        </SubmitButton>
      </div>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
    </form>
  );
}

/** Desactivar / reactivar inscripción (solo ADMIN; conserva historial). */
export function ToggleEnrollmentForm({
  enrollmentId,
  studentId,
  active,
}: {
  enrollmentId: string;
  studentId: string;
  active: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    toggleEnrollmentAction,
    {},
  );
  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="enrollmentId" value={enrollmentId} />
        <input type="hidden" name="studentId" value={studentId} />
        <input
          type="hidden"
          name="action"
          value={active ? "deactivate" : "reactivate"}
        />
        <SubmitButton
          variant="ghost"
          pendingText="…"
          confirmText={
            active
              ? "¿Desactivar la inscripción? Los packs, movimientos y asistencias se conservan."
              : undefined
          }
        >
          {active ? "Desactivar inscripción" : "Reactivar inscripción"}
        </SubmitButton>
      </form>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
    </div>
  );
}
