"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { saveProductAction } from "@/server/actions/catalog";
import {
  ErrorNotice,
  Field,
  SuccessNotice,
  inputClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface ProductValues {
  id: string;
  name: string;
  classCount: number;
  referencePrice: unknown;
  validityDays: number;
  disciplineId: string | null;
  active: boolean;
}

export function ProductForm({
  product,
  disciplines,
  currentDiscipline,
}: {
  product?: ProductValues;
  disciplines: Array<{ id: string; name: string }>;
  /** Disciplina actual del producto (puede estar inactiva). */
  currentDiscipline?: { id: string; name: string; active: boolean } | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveProductAction,
    {},
  );
  const prefix = product?.id ?? "new";
  // La disciplina actual se conserva visible aunque esté inactiva: el
  // producto NO se convierte silenciosamente en genérico; cambiarla es una
  // decisión explícita (y el servidor exige disciplinas activas para
  // asignaciones nuevas).
  const showInactiveCurrent =
    currentDiscipline &&
    !currentDiscipline.active &&
    !disciplines.some((d) => d.id === currentDiscipline.id);

  return (
    <form action={formAction} className="space-y-3">
      {product && <input type="hidden" name="productId" value={product.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nombre" htmlFor={`${prefix}-name`} required>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={80}
            defaultValue={product?.name}
            placeholder="Ej.: Pack x4"
            className={inputClass()}
          />
        </Field>
        <Field label="Cantidad de clases" htmlFor={`${prefix}-classCount`} required>
          <input
            id={`${prefix}-classCount`}
            name="classCount"
            type="number"
            min={1}
            max={200}
            required
            defaultValue={product?.classCount ?? 4}
            className={inputClass()}
          />
        </Field>
        <Field label="Precio de referencia (ARS)" htmlFor={`${prefix}-price`} required>
          <input
            id={`${prefix}-price`}
            name="referencePrice"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={product ? String(product.referencePrice) : ""}
            className={inputClass()}
          />
        </Field>
        <Field label="Vigencia (días)" htmlFor={`${prefix}-validity`} required>
          <input
            id={`${prefix}-validity`}
            name="validityDays"
            type="number"
            min={1}
            max={730}
            required
            defaultValue={product?.validityDays ?? 30}
            className={inputClass()}
          />
        </Field>
        <Field label="Disciplina aplicable" htmlFor={`${prefix}-discipline`}>
          <select
            id={`${prefix}-discipline`}
            name="disciplineId"
            defaultValue={product?.disciplineId ?? ""}
            className={inputClass()}
          >
            <option value="">Todas las disciplinas</option>
            {showInactiveCurrent && (
              <option value={currentDiscipline.id}>
                {currentDiscipline.name} (inactiva)
              </option>
            )}
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-tinta-suave">
        Un pack de una disciplina sirve para CUALQUIER horario de esa
        disciplina. &quot;Todas las disciplinas&quot; lo hace genérico.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={product?.active ?? true}
        />
        Producto activo
      </label>
      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.success} />
      <SubmitButton>{product ? "Guardar cambios" : "Crear producto"}</SubmitButton>
    </form>
  );
}
