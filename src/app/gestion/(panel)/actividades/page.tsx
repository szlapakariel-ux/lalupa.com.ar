import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { WEEKDAY_LABELS } from "@/lib/dates";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { DisciplineForm } from "./discipline-form";
import { ScheduleForm } from "./schedule-form";

export const dynamic = "force-dynamic";

export default async function ActividadesPage() {
  const user = await requirePageUser();
  const isAdmin = user.role === "ADMIN";
  const [disciplines, teachers] = await Promise.all([
    prisma.discipline.findMany({
      include: {
        activities: {
          include: { teacher: { select: { id: true, name: true } } },
          orderBy: [{ active: "desc" }, { weekday: "asc" }, { startTime: "asc" }],
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const attendanceCounts = await prisma.attendance.groupBy({
    by: ["activityId"],
    _count: { _all: true },
  });
  const historyByActivity = new Map(
    attendanceCounts.map((c) => [c.activityId, c._count._all]),
  );

  return (
    <div className="space-y-4">
      <PageTitle title="Disciplinas y horarios" />

      {disciplines.length === 0 ? (
        <EmptyState
          title="Sin disciplinas configuradas."
          hint={isAdmin ? "Creá la primera disciplina abajo." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {disciplines.map((d) => (
            <Card key={d.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-medium">{d.name}</p>
                  {d.description && (
                    <p className="text-sm text-tinta-suave">{d.description}</p>
                  )}
                </div>
                <Badge tone={d.active ? "exito" : "neutral"}>
                  {d.active ? "Activa" : "Inactiva"}
                </Badge>
              </div>

              {/* Horarios de la disciplina */}
              {d.activities.length === 0 ? (
                <p className="text-sm text-tinta-suave">Sin horarios cargados.</p>
              ) : (
                <ul className="space-y-2">
                  {d.activities.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-borde bg-arena-claro/30 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {WEEKDAY_LABELS[a.weekday]} {a.startTime}
                          <span className="ml-2 font-normal text-tinta-suave">
                            {a.durationMin} min
                            {a.capacity ? ` · cupo ${a.capacity}` : ""} ·{" "}
                            {a.teacher?.name ?? "sin profesora"}
                          </span>
                        </p>
                        {!a.active && <Badge tone="neutral">Inactivo</Badge>}
                      </div>
                      {isAdmin && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-terracota">
                            Editar horario
                          </summary>
                          <div className="mt-2">
                            <ScheduleForm
                              disciplineId={d.id}
                              teachers={teachers}
                              schedule={{
                                id: a.id,
                                weekday: a.weekday,
                                startTime: a.startTime,
                                durationMin: a.durationMin,
                                capacity: a.capacity,
                                teacherId: a.teacherId,
                                active: a.active,
                                hasHistory: (historyByActivity.get(a.id) ?? 0) > 0,
                              }}
                            />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && (
                <div className="flex flex-col gap-2">
                  <details>
                    <summary className="cursor-pointer text-sm text-terracota">
                      + Agregar horario
                    </summary>
                    <div className="mt-2">
                      <ScheduleForm disciplineId={d.id} teachers={teachers} />
                    </div>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-sm text-terracota">
                      Editar disciplina
                    </summary>
                    <div className="mt-2">
                      <DisciplineForm
                        discipline={{
                          id: d.id,
                          name: d.name,
                          description: d.description,
                          active: d.active,
                        }}
                      />
                    </div>
                  </details>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {isAdmin && (
        <Card>
          <details>
            <summary className="cursor-pointer font-medium text-terracota">
              + Nueva disciplina
            </summary>
            <div className="mt-3">
              <DisciplineForm />
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
