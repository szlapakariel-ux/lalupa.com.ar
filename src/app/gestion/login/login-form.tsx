"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/server/actions/auth";
import { Card, ErrorNotice, Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <Field label="Email" htmlFor="email" required>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className={inputClass()}
            placeholder="tu@email.com"
          />
        </Field>
        <Field label="Contraseña" htmlFor="password" required>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass()}
          />
        </Field>
        <ErrorNotice message={state.error} />
        <SubmitButton pendingText="Ingresando…" className="w-full">
          Ingresar
        </SubmitButton>
      </form>
    </Card>
  );
}
