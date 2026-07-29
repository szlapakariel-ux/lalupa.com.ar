import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-user";
import { listStudents } from "@/server/queries";
import { formatYMD } from "@/lib/dates";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PACK_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
  PageTitle,
  STUDENT_STATUS_BADGE,
  buttonClass,
  cx,
  inputClass,
} from "@/components/ui";
import type { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: StudentStatus | "TODAS"; label: string }> = [
  { value: "TODAS", label: "Todas" },
  { value: "ACTIVA", label: "Activas" },
  { value: "PAUSADA", label: "Pausadas" },
  { value: "INACTIVA", label: "Inactivas" },
];

export default async function AlumnasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const estado = (FILTERS.find((f) => f.value === params.estado)?.value ??
    "TODAS") as StudentStatus | "TODAS";

  const students = await listStudents({ q, status: estado, role: user.role });

  return (
    <div className="space-y-4">
      <PageTitle
        title="Alumnas"
        action={
          user.role === "ADMIN" ? (
            <LinkButton href="/gestion/alumnas/nueva">+ Nueva alumna</LinkButton>
          ) : undefined
        }
      />

      {/* Búsqueda y filtros */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o teléfono…"
          aria-label="Buscar alumnas"
          className={inputClass("max-w-xs")}
        />
        <input type="hidden" name="estado" value={estado} />
        <button type="submit" className={buttonClass("secondary")}>
          Buscar
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/gestion/alumnas?estado=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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

      {students.length === 0 ? (
        <EmptyState
          title={q ? `Sin resultados para "${q}".` : "Todavía no hay alumnas cargadas."}
          hint={
            user.role === "ADMIN" && !q
              ? "Empezá creando la primera alumna."
              : undefined
          }
          action={
            user.role === "ADMIN" && !q ? (
              <LinkButton href="/gestion/alumnas/nueva">+ Nueva alumna</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {students.map((s) => {
            const packBadge = s.currentPackStatus
              ? PACK_STATUS_BADGE[s.currentPackStatus]
              : null;
            const payBadge = s.paymentStatus
              ? PAYMENT_STATUS_BADGE[s.paymentStatus]
              : null;
            const estadoBadge = STUDENT_STATUS_BADGE[s.status];
            return (
              <Card key={s.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-tinta">
                      {s.lastName}, {s.firstName}
                      {s.hasAlerts && (
                        <span
                          title="Tiene alertas activas"
                          aria-label="Tiene alertas activas"
                          className="ml-2 text-alerta"
                        >
                          ⚠
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {s.phone ?? "Sin teléfono"}
                      {s.currentPackName && ` · ${s.currentPackName}`}
                      {s.currentPackExpiresYMD &&
                        ` · vence ${formatYMD(s.currentPackExpiresYMD)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={estadoBadge.tone}>{estadoBadge.label}</Badge>
                    {packBadge && <Badge tone={packBadge.tone}>{packBadge.label}</Badge>}
                    {payBadge && <Badge tone={payBadge.tone}>Pago: {payBadge.label}</Badge>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <span>
                    <strong className="text-lg">{s.available}</strong>{" "}
                    <span className="text-tinta-suave">disponibles</span>
                  </span>
                  <span className="text-tinta-suave">{s.used} usadas</span>
                  <span className="text-tinta-suave">{s.purchased} compradas</span>
                </div>

                {/* Tres acciones principales, cómodas en celular */}
                <div className="grid grid-cols-3 gap-2">
                  <LinkButton
                    href={`/gestion/alumnas/${s.id}/tomar-clase`}
                    className="text-center"
                  >
                    Tomó clase
                  </LinkButton>
                  {user.role === "ADMIN" ? (
                    <LinkButton
                      href={`/gestion/alumnas/${s.id}/pack`}
                      variant="secondary"
                      className="text-center"
                    >
                      Pack / pago
                    </LinkButton>
                  ) : (
                    <span />
                  )}
                  <LinkButton
                    href={`/gestion/alumnas/${s.id}`}
                    variant="secondary"
                    className="text-center"
                  >
                    Ver ficha
                  </LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
