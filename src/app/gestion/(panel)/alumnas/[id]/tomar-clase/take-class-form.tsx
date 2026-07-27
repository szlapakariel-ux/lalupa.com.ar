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
  /** Próxima fecha real de este horario ("YYYY-MM-DD"), calculada en el server. */
  autoDateYMD: string;
  /** Saldo calculado para autoDateYMD (no para "hoy"). */
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
  const first = activities[0];
  const [activityId, setActivityId] = useState(first?.id ?? "");
  const [dateYMD, setDateYMD] = useState(first?.autoDateYMD ?? today);
  const selected = activities.find((a) => a.id === activityId);
  const balance = selected?.balance ?? 0;
  // El saldo mostrado corresponde a la fecha automática del horario; si la
  // usuaria eligió otra fecha a mano, no afirmamos un número exacto.
  const dateMatchesAuto = selected ? dateYMD === selected.autoDateYMD : true;

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
            if (next) setDateYMD(next.autoDateYMD);
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
      {dateMatchesAuto ? (
        <div
          className={
            balance > 0
              ? "rounded-lg bg-exito-claro px-3 py-2 text-sm text-exito"
              : "rounded-lg bg-alerta-claro px-3 py-2 text-sm text-alerta"
          }
          role="status"
        >
          {balance > 0
            ? `Saldo disponible para esta disciplina el ${dateYMD.split("-").reverse().join("/")}: ${balance} clase${balance === 1 ? "" : "s"}. Si consume, quedará${balance - 1 === 1 ? "" : "n"} ${balance - 1}.`
            : "Sin clases disponibles para esta disciplina en esa fecha."}
        </div>
      ) : (
        <div className="rounded-lg bg-arena-claro px-3 py-2 text-sm text-tinta-suave" role="status">
          Elegiste una fecha distinta a la próxima clase de este horario. El
          saldo definitivo se valida para la fecha elegida al registrar.
        </div>
      )}

      {isAdmin && dateMatchesAuto && balance <= 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="allowNegative" value="true" className="mt-1" />
          <span>
            Registrar igualmente dejando saldo negativo (acción administrativa;
            queda auditada). Solo aplica a packs genéricos o de esta disciplina.
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
