"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import {
  annulPaymentAction,
  updatePaymentStatusAction,
} from "@/server/actions/payments";
import { ErrorNotice, SuccessNotice, buttonClass, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function PaymentRowActions({
  paymentId,
  status,
}: {
  paymentId: string;
  status: string;
}) {
  const [statusState, statusAction] = useActionState<ActionState, FormData>(
    updatePaymentStatusAction,
    {},
  );
  const [annulState, annulAction] = useActionState<ActionState, FormData>(
    annulPaymentAction,
    {},
  );
  const [annulling, setAnnulling] = useState(false);

  return (
    <div className="space-y-2 border-t border-borde pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "PAGADO" && (
          <form action={statusAction}>
            <input type="hidden" name="paymentId" value={paymentId} />
            <input type="hidden" name="status" value="PAGADO" />
            <SubmitButton variant="secondary" pendingText="…">
              Marcar pagado
            </SubmitButton>
          </form>
        )}
        {status !== "PARCIAL" && status !== "PAGADO" && (
          <form action={statusAction}>
            <input type="hidden" name="paymentId" value={paymentId} />
            <input type="hidden" name="status" value="PARCIAL" />
            <SubmitButton variant="ghost" pendingText="…">
              Marcar parcial
            </SubmitButton>
          </form>
        )}
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setAnnulling((v) => !v)}
        >
          Anular…
        </button>
      </div>

      {annulling && (
        <form action={annulAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <label className="sr-only" htmlFor={`annul-${paymentId}`}>
            Motivo de anulación
          </label>
          <input
            id={`annul-${paymentId}`}
            name="reason"
            required
            placeholder="Motivo de la anulación"
            maxLength={200}
            className={inputClass("max-w-xs")}
          />
          <SubmitButton
            variant="danger"
            confirmText="¿Anular este pago? Queda registrado como anulado, no se borra."
          >
            Confirmar anulación
          </SubmitButton>
        </form>
      )}

      <ErrorNotice message={statusState.error ?? annulState.error} />
      <SuccessNotice message={statusState.success ?? annulState.success} />
    </div>
  );
}
