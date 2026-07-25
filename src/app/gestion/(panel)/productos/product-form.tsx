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
import { WEEKDAY_LABELS, type WeekdayName } from "@/lib/dates";

interface ProductValues {
  id: string;
  name: string;
  classCount: number;
  referencePrice: unknown;
  validityDays: number;
  activityId: string | null;
  active: boolean;
}

export function ProductForm({
  product,
  activities,
}: {
  product?: ProductValues;
  activities: Array<{ id: string; name: string; weekday: string; startTime: string }>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveProductAction,
    {},
  );
  const prefix = product?.id ?? "new";

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
        <Field label="Actividad aplicable" htmlFor={`${prefix}-activity`}>
          <select
            id={`${prefix}-activity`}
            name="activityId"
            defaultValue={product?.activityId ?? ""}
            className={inputClass()}
          >
            <option value="">Todas las actividades</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {WEEKDAY_LABELS[a.weekday as WeekdayName]} {a.startTime}
              </option>
            ))}
          </select>
        </Field>
      </div>
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
