"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import {
  registerAttendanceAction,
  revertAttendanceAction,
} from "@/server/actions/attendance";
import {
  ATTENDANCE_STATUS_LABEL,
  Badge,
  ErrorNotice,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function MarkAttendanceForm({
  studentId,
  studentName,
  studentStatus,
  activityId,
  dateYMD,
  balance,
  isAdmin,
}: {
  studentId: string;
  studentName: string;
  studentStatus: string;
  activityId: string;
  dateYMD: string;
  balance: number;
  isAdmin: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    registerAttendanceAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="space-y-2 rounded-lg border border-borde bg-arena-claro/30 p-3"
    >
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="dateYMD" value={dateYMD} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {studentName}
          {studentStatus !== "ACTIVA" && (
            <Badge tone="aviso" className="ml-2">
              {studentStatus === "PAUSADA" ? "Pausada" : "Inactiva"}
            </Badge>
          )}
        </p>
        <Badge tone={balance > 0 ? "exito" : "alerta"}>
          {balance > 0
            ? `${balance} clase${balance === 1 ? "" : "s"} disponible${balance === 1 ? "" : "s"}`
            : "Sin saldo"}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`status-${studentId}`}>
          Estado de asistencia
        </label>
        <select
          id={`status-${studentId}`}
          name="status"
          defaultValue="PRESENTE"
          className={inputClass("max-w-52")}
        >
          {Object.entries(ATTENDANCE_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {isAdmin && balance <= 0 && (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="allowNegative" value="true" />
            Permitir saldo negativo
          </label>
        )}
        <SubmitButton pendingText="Registrando…">Registrar</SubmitButton>
      </div>

      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
    </form>
  );
}

export function RevertAttendanceForm({ attendanceId }: { attendanceId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    revertAttendanceAction,
    {},
  );
  return (
    <div className="text-right">
      <form action={formAction} className="inline-flex items-center gap-2">
        <input type="hidden" name="attendanceId" value={attendanceId} />
        <input type="hidden" name="reason" value="Reversión desde Clases de hoy" />
        <SubmitButton
          variant="ghost"
          pendingText="…"
          confirmText="¿Revertir esta asistencia? Si descontó una clase, vuelve al saldo. La operación queda registrada."
        >
          Revertir
        </SubmitButton>
      </form>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
    </div>
  );
}
