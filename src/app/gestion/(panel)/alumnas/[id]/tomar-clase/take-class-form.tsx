"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { registerAttendanceAction } from "@/server/actions/attendance";
import {
  ATTENDANCE_STATUS_LABEL,
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface ActivityOption {
  id: string;
  label: string;
  balance: number;
}

export function TakeClassForm({
  studentId,
  isAdmin,
  today,
  activities,
}: {
  studentId: string;
  isAdmin: boolean;
  today: string;
  activities: ActivityOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    registerAttendanceAction,
    {},
  );
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const selected = activities.find((a) => a.id === activityId);
  const balance = selected?.balance ?? 0;

  if (activities.length === 0) {
    return <p className="text-sm text-tinta-suave">No hay actividades activas configuradas.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="studentId" value={studentId} />
      <Field label="Actividad" htmlFor="activityId" required>
        <select
          id="activityId"
          name="activityId"
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
          className={inputClass()}
        >
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
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
      <Field label="Estado" htmlFor="status" required>
        <select id="status" name="status" defaultValue="PRESENTE" className={inputClass()}>
          {Object.entries(ATTENDANCE_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      {/* Saldo visible ANTES de confirmar */}
      <div
        className={
          balance > 0
            ? "rounded-lg bg-exito-claro px-3 py-2 text-sm text-exito"
            : "rounded-lg bg-alerta-claro px-3 py-2 text-sm text-alerta"
        }
        role="status"
      >
        {balance > 0
          ? `Saldo disponible para esta actividad: ${balance} clase${balance === 1 ? "" : "s"}. Si consume, quedará${balance - 1 === 1 ? "" : "n"} ${balance - 1}.`
          : "Sin clases disponibles para esta actividad."}
      </div>

      {isAdmin && balance <= 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="allowNegative" value="true" className="mt-1" />
          <span>
            Registrar igualmente dejando saldo negativo (acción administrativa;
            queda auditada).
          </span>
        </label>
      )}

      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton className="w-full" pendingText="Registrando…">
        Confirmar asistencia
      </SubmitButton>
    </form>
  );
}
