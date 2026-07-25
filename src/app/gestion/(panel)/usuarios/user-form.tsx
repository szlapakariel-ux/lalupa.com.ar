"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { saveUserAction } from "@/server/actions/users";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface UserValues {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TEACHER";
  active: boolean;
}

export function UserForm({
  user,
  isSelf,
}: {
  user?: UserValues;
  isSelf?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveUserAction,
    {},
  );
  const prefix = user?.id ?? "new";

  return (
    <form action={formAction} className="space-y-3">
      {user && <input type="hidden" name="userId" value={user.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nombre" htmlFor={`${prefix}-name`} required>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={user?.name}
            className={inputClass()}
          />
        </Field>
        <Field label="Email" htmlFor={`${prefix}-email`} required>
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            required
            defaultValue={user?.email}
            className={inputClass()}
          />
        </Field>
        <Field label="Rol" htmlFor={`${prefix}-role`} required>
          <select
            id={`${prefix}-role`}
            name="role"
            defaultValue={user?.role ?? "TEACHER"}
            disabled={isSelf}
            className={inputClass()}
          >
            <option value="TEACHER">Profesora</option>
            <option value="ADMIN">Administradora</option>
          </select>
        </Field>
        <Field
          label={user ? "Nueva contraseña (opcional)" : "Contraseña inicial"}
          htmlFor={`${prefix}-password`}
          required={!user}
          hint="Mínimo 10 caracteres."
        >
          <input
            id={`${prefix}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={200}
            required={!user}
            className={inputClass()}
          />
        </Field>
      </div>
      {isSelf && <input type="hidden" name="role" value="ADMIN" />}
      {isSelf ? (
        <input type="hidden" name="active" value="true" />
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={user?.active ?? true}
          />
          Cuenta activa (desmarcá para bloquear el acceso)
        </label>
      )}
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton>{user ? "Guardar cambios" : "Crear usuaria"}</SubmitButton>
    </form>
  );
}
