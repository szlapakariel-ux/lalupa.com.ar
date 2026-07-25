import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { dateToYMD, formatARS, formatYMD } from "@/lib/dates";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_BADGE,
  PageTitle,
  cx,
} from "@/components/ui";
import { PaymentRowActions } from "./payment-actions";
import type { PaymentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: PaymentStatus | "TODOS"; label: string }> = [
  { value: "TODOS", label: "Todos" },
  { value: "PENDIENTE", label: "Pendientes" },
  { value: "PARCIAL", label: "Parciales" },
  { value: "PAGADO", label: "Pagados" },
  { value: "BONIFICADO", label: "Bonificados" },
  { value: "ANULADO", label: "Anulados" },
];

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  await requirePageUser("ADMIN");
  const params = await searchParams;
  const estado = (FILTERS.find((f) => f.value === params.estado)?.value ??
    "TODOS") as PaymentStatus | "TODOS";

  const payments = await prisma.payment.findMany({
    where: estado === "TODOS" ? {} : { status: estado },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { name: true } },
      studentPack: { include: { product: { select: { name: true } } } },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pagos"
        action={<LinkButton href="/gestion/pagos/nuevo">+ Registrar pago</LinkButton>}
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pagos">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/gestion/pagos?estado=${f.value}`}
            className={cx(
              "rounded-full border px-3 py-1.5 text-sm",
              estado === f.value
                ? "border-tinta bg-tinta text-crema"
                : "border-arena bg-papel text-tinta-suave hover:text-tinta",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {payments.length === 0 ? (
        <EmptyState title="No hay pagos con este filtro." />
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const badge = PAYMENT_STATUS_BADGE[p.status];
            return (
              <Card key={p.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      <Link
                        href={`/gestion/alumnas/${p.student.id}`}
                        className="hover:underline"
                      >
                        {p.student.lastName}, {p.student.firstName}
                      </Link>
                      <span className="ml-2">{formatARS(p.amount.toString())}</span>
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {p.concept ?? p.studentPack?.product.name ?? "Sin concepto"} ·{" "}
                      {PAYMENT_METHOD_LABEL[p.method]} · {formatYMD(dateToYMD(p.date))} ·
                      registró {p.createdBy.name}
                      {p.reference && ` · ref: ${p.reference}`}
                    </p>
                  </div>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                {p.status !== "ANULADO" && <PaymentRowActions paymentId={p.id} status={p.status} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
