import type { ReactNode } from "react";
import Link from "next/link";

/* Kit de UI mínimo, coherente con la identidad de La Lupa.
   Componentes de presentación sin estado (usables desde Server Components). */

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-tinta text-crema hover:bg-terracota-oscuro active:opacity-90 border border-tinta",
  secondary:
    "bg-papel text-tinta border border-arena hover:border-terracota hover:text-terracota-oscuro",
  danger:
    "bg-alerta-claro text-alerta border border-alerta/40 hover:bg-alerta hover:text-white",
  ghost: "bg-transparent text-tinta-suave hover:text-tinta hover:bg-arena-claro",
};

export function buttonClass(variant: ButtonVariant = "primary", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
    "min-h-12 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracota",
    "disabled:opacity-50 disabled:pointer-events-none",
    BUTTON_STYLES[variant],
    extra,
  );
}

export function LinkButton({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-borde bg-papel p-4 shadow-[0_1px_3px_rgba(42,33,24,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-2xl text-tinta">{title}</h1>
      {action}
    </div>
  );
}

type BadgeTone = "exito" | "aviso" | "alerta" | "neutral" | "salvia";

const BADGE_STYLES: Record<BadgeTone, string> = {
  exito: "bg-exito-claro text-exito",
  aviso: "bg-aviso-claro text-aviso",
  alerta: "bg-alerta-claro text-alerta",
  neutral: "bg-arena-claro text-tinta-suave",
  salvia: "bg-salvia-claro text-salvia",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_STYLES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STUDENT_STATUS_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  ACTIVA: { tone: "exito", label: "Activa" },
  PAUSADA: { tone: "aviso", label: "Pausada" },
  INACTIVA: { tone: "neutral", label: "Inactiva" },
};

export const PACK_STATUS_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  ACTIVO: { tone: "exito", label: "Vigente" },
  AGOTADO: { tone: "neutral", label: "Agotado" },
  VENCIDO: { tone: "alerta", label: "Vencido" },
  CANCELADO: { tone: "neutral", label: "Cancelado" },
};

export const PAYMENT_STATUS_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  PENDIENTE: { tone: "aviso", label: "Pendiente" },
  PAGADO: { tone: "exito", label: "Pagado" },
  PARCIAL: { tone: "aviso", label: "Parcial" },
  BONIFICADO: { tone: "salvia", label: "Bonificado" },
  ANULADO: { tone: "neutral", label: "Anulado" },
};

export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  PRESENTE: "Presente",
  CANCELO_A_TIEMPO: "Canceló a tiempo",
  CANCELO_TARDE: "Canceló tarde",
  AUSENTE: "Ausente",
  CLASE_PRUEBA: "Clase de prueba",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  OTRO: "Otro",
};

export const ALERT_TYPE_LABEL: Record<string, string> = {
  ALERGIA: "Alergia",
  LESION: "Lesión",
  LIMITACION: "Limitación",
  RESTRICCION_ALIMENTARIA: "Restricción alimentaria",
  CONTACTO_EMERGENCIA: "Contacto de emergencia",
  OTRA: "Otra precaución",
};

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  PACK_PURCHASE: "Compra de pack",
  CLASS_USED: "Clase utilizada",
  BONUS: "Bonificación",
  CORRECTION_POS: "Corrección (+)",
  CORRECTION_NEG: "Corrección (−)",
  EXPIRATION: "Vencimiento",
  CANCELLATION: "Cancelación",
  REVERSAL: "Reversión",
};

export function inputClass(extra?: string) {
  return cx(
    "w-full rounded-lg border border-arena bg-papel px-3 py-2.5 text-sm text-tinta",
    "placeholder:text-tinta-suave/60 min-h-12",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terracota",
    extra,
  );
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-tinta">
        {label}
        {required && <span className="text-alerta"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-tinta-suave">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-arena bg-papel/60 px-6 py-10 text-center">
      <p className="font-medium text-tinta">{title}</p>
      {hint && <p className="mt-1 text-sm text-tinta-suave">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-alerta/30 bg-alerta-claro px-3 py-2 text-sm text-alerta"
    >
      {message}
    </p>
  );
}

export function SuccessNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-lg border border-exito/30 bg-exito-claro px-3 py-2 text-sm text-exito"
    >
      {message}
    </p>
  );
}
