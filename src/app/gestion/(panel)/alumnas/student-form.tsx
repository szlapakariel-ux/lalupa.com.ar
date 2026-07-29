"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import {
  createStudentAction,
  updateStudentAction,
} from "@/server/actions/students";
import {
  Card,
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export interface StudentFormValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  status?: string;
}

export function StudentForm({ student }: { student?: StudentFormValues }) {
  const action = student?.id ? updateStudentAction : createStudentAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        {student?.id && <input type="hidden" name="studentId" value={student.id} />}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" htmlFor="firstName" required>
            <input
              id="firstName"
              name="firstName"
              required
              maxLength={80}
              defaultValue={student?.firstName}
              className={inputClass()}
            />
          </Field>
          <Field label="Apellido" htmlFor="lastName" required>
            <input
              id="lastName"
              name="lastName"
              required
              maxLength={80}
              defaultValue={student?.lastName}
              className={inputClass()}
            />
          </Field>
          <Field label="Teléfono" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={40}
              defaultValue={student?.phone ?? ""}
              className={inputClass()}
            />
          </Field>
          <Field label="Email (opcional)" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={student?.email ?? ""}
              className={inputClass()}
            />
          </Field>
          <Field label="Contacto de emergencia (opcional)" htmlFor="emergencyContactName">
            <input
              id="emergencyContactName"
              name="emergencyContactName"
              maxLength={120}
              defaultValue={student?.emergencyContactName ?? ""}
              className={inputClass()}
            />
          </Field>
          <Field label="Teléfono de emergencia" htmlFor="emergencyContactPhone">
            <input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              maxLength={40}
              defaultValue={student?.emergencyContactPhone ?? ""}
              className={inputClass()}
            />
          </Field>
          <Field label="Estado" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={student?.status ?? "ACTIVA"}
              className={inputClass()}
            >
              <option value="ACTIVA">Activa</option>
              <option value="PAUSADA">Pausada</option>
              <option value="INACTIVA">Inactiva</option>
            </select>
          </Field>
        </div>
        <Field
          label="Observaciones administrativas"
          htmlFor="notes"
          hint="No cargar acá información médica: usá las alertas de la ficha."
        >
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={student?.notes ?? ""}
            className={inputClass()}
          />
        </Field>
        <ErrorNotice message={state.error} />
        <SuccessNotice message={state.success} />
        <SubmitButton className="w-full md:w-auto">
          {student?.id ? "Guardar cambios" : "Crear alumna"}
        </SubmitButton>
      </form>
    </Card>
  );
}
