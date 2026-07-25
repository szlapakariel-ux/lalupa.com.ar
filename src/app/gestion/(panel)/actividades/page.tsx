import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { WEEKDAY_LABELS } from "@/lib/dates";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { ActivityForm } from "./activity-form";

export const dynamic = "force-dynamic";

export default async function ActividadesPage() {
  const user = await requirePageUser();
  const isAdmin = user.role === "ADMIN";
  const [activities, teachers] = await Promise.all([
    prisma.activity.findMany({
      include: { teacher: { select: { id: true, name: true } } },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle title="Actividades" />

      {activities.length === 0 ? (
        <EmptyState
          title="Sin actividades configuradas."
          hint={isAdmin ? "Creá la primera actividad abajo." : undefined}
        />
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {a.name}
                    <span className="ml-2 text-sm text-tinta-suave">
                      {WEEKDAY_LABELS[a.weekday]} {a.startTime} · {a.durationMin} min
                      {a.capacity ? ` · cupo ${a.capacity}` : ""}
                    </span>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {a.teacher?.name ?? "Sin profesora asignada"}
                    {a.description ? ` · ${a.description}` : ""}
                  </p>
                </div>
                <Badge tone={a.active ? "exito" : "neutral"}>
                  {a.active ? "Activa" : "Inactiva"}
                </Badge>
              </div>
              {isAdmin && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-terracota">
                    Editar
                  </summary>
                  <div className="mt-3">
                    <ActivityForm activity={a} teachers={teachers} />
                  </div>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}

      {isAdmin && (
        <Card>
          <details>
            <summary className="cursor-pointer font-medium text-terracota">
              + Nueva actividad
            </summary>
            <div className="mt-3">
              <ActivityForm teachers={teachers} />
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
