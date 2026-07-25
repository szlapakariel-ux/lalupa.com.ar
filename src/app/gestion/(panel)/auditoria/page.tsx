import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { formatDateTimeAR } from "@/lib/dates";
import {
  Badge,
  Card,
  EmptyState,
  PageTitle,
  buttonClass,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ accion?: string; entidad?: string }>;
}) {
  await requirePageUser("ADMIN");
  const params = await searchParams;
  const accion = params.accion?.trim();
  const entidad = params.entidad?.trim();

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(accion ? { action: { contains: accion } } : {}),
      ...(entidad ? { entity: { contains: entidad, mode: "insensitive" } } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <PageTitle title="Auditoría" />
      <Card>
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="accion" className="mb-1 block text-sm font-medium">
              Acción
            </label>
            <input
              id="accion"
              name="accion"
              defaultValue={accion}
              placeholder="ej.: attendance"
              className={inputClass("max-w-48")}
            />
          </div>
          <div>
            <label htmlFor="entidad" className="mb-1 block text-sm font-medium">
              Entidad
            </label>
            <input
              id="entidad"
              name="entidad"
              defaultValue={entidad}
              placeholder="ej.: Payment"
              className={inputClass("max-w-48")}
            />
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            Filtrar
          </button>
        </form>
      </Card>

      {events.length === 0 ? (
        <EmptyState title="Sin eventos para este filtro." />
      ) : (
        <Card className="divide-y divide-borde p-0">
          {events.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm">{e.action}</span>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={e.result === "OK" ? "exito" : e.result === "DENIED" ? "aviso" : "alerta"}
                  >
                    {e.result}
                  </Badge>
                  <span className="text-xs text-tinta-suave">
                    {formatDateTimeAR(e.createdAt)}
                  </span>
                </div>
              </div>
              <p className="mt-0.5 text-sm text-tinta-suave">
                {e.user?.name ?? "Sistema"} · {e.entity}
                {e.entityId && ` · ${e.entityId.slice(0, 12)}…`}
                {e.ip && ` · ${e.ip}`}
              </p>
              {e.metadata != null && (
                <pre className="mt-1 overflow-x-auto rounded bg-arena-claro/50 px-2 py-1 text-xs text-tinta-suave">
                  {JSON.stringify(e.metadata)}
                </pre>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
