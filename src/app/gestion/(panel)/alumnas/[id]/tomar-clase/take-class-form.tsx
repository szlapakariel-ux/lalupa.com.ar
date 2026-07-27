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
import { WEEKDAY_LABELS, type WeekdayName } from "@/lib/dates";

interface ActivityOption {
  id: string;
  label: string;
  weekday: string;
  balance: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  DOMINGO: 0,
  LUNES: 1,
  MARTES: 2,
  MIERCOLES: 3,
  JUEVES: 4,
  VIERNES: 5,
  SABADO: 6,
};

/** Próxima fecha (>= hoy) que cae en el día de semana del horario. */
function nextDateForWeekday(todayYMD: string, weekday: string): string {
  const date = new Date(`${todayYMD}T00:00:00.000Z`);
  const target = WEEKDAY_INDEX[weekday] ?? date.getUTCDay();
  const delta = (target - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
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
  const first = activities[0];
  const [activityId, setActivityId] = useState(first?.id ?? "");
  const [dateYMD, setDateYMD] = useState(
    first ? nextDateForWeekday(today, first.weekday) : today,
  );
  const selected = activities.find((a) => a.id === activityId);
  const balance = selected?.balance ?? 0;

  if (activities.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        No hay horarios activos en las disciplinas donde está inscripta.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="studentId" value={studentId} />
      <Field label="Horario" htmlFor="activityId" required>
        <select
          id="activityId"
          name="activityId"
          value={activityId}
          onChange={(e) => {
            setActivityId(e.target.value);
            const next = activities.find((a) => a.id === e.target.value);
            if (next) setDateYMD(nextDateForWeekday(today, next.weekday));
          }}
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
          value={dateYMD}
          onChange={(e) => setDateYMD(e.target.value)}
          required
          className={inputClass()}
        />
      </Field>
      {selected && (
        <p className="text-xs text-tinta-suave">
          Este horario es de {WEEKDAY_LABELS[selected.weekday as WeekdayName].toLowerCase()};
          la fecha debe caer ese día.
        </p>
      )}
      <Field label="Estado" htmlFor="status" required>
        <select id="status" name="status" defaultValue="PRESENTE" className={inputClass()}>
          {Object.entries(ATTENDANCE_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      {/* Saldo visible ANTES de confirmar (packs de la disciplina + genéricos) */}
      <div
        className={
          balance > 0
            ? "rounded-lg bg-exito-claro px-3 py-2 text-sm text-exito"
            : "rounded-lg bg-alerta-claro px-3 py-2 text-sm text-alerta"
        }
        role="status"
      >
        {balance > 0
          ? `Saldo disponible para esta disciplina: ${balance} clase${balance === 1 ? "" : "s"}. Si consume, quedará${balance - 1 === 1 ? "" : "n"} ${balance - 1}.`
          : "Sin clases disponibles para esta disciplina."}
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
