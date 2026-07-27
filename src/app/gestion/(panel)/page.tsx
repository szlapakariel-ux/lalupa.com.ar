import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { expirePacks } from "@/server/services/packs";
import { listStudents } from "@/server/queries";
import {
  addDaysYMD,
  dateToYMD,
  formatYMD,
  todayYMD,
  weekdayOfYMD,
  WEEKDAY_LABELS,
  formatDateTimeAR,
} from "@/lib/dates";
import {
  Badge,
  Card,
  EmptyState,
  LEDGER_TYPE_LABEL,
  PageTitle,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const today = todayYMD();

  // Vencimiento perezoso de packs (idempotente): el dashboard es la puerta
  // de entrada diaria, no hace falta un cron en el MVP.
  await expirePacks(today).catch(() => ({ expired: 0 }));

  const weekday = weekdayOfYMD(today);
  const [activities, attendancesToday, expiringPacks, expiredPacks, pendingPayments, lastMovements, students] =
    await Promise.all([
      prisma.activity.findMany({
        where: { weekday, active: true },
        include: { teacher: { select: { name: true } } },
        orderBy: { startTime: "asc" },
      }),
      prisma.attendance.findMany({
        where: { date: new Date(`${today}T00:00:00.000Z`), revertedAt: null },
        include: {
          student: { select: { firstName: true, lastName: true } },
          activity: { select: { name: true, startTime: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.studentPack.findMany({
        where: {
          status: "ACTIVO",
          expiresAt: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lte: new Date(`${addDaysYMD(today, 7)}T00:00:00.000Z`),
          },
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          product: { select: { name: true } },
        },
        orderBy: { expiresAt: "asc" },
        take: 10,
      }),
      prisma.studentPack.count({ where: { status: "VENCIDO" } }),
      prisma.payment.findMany({
        where: { status: { in: ["PENDIENTE", "PARCIAL"] } },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { date: "asc" },
        take: 10,
      }),
      prisma.ledgerMovement.findMany({
        include: {
          student: { select: { firstName: true, lastName: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      listStudents({ role: user.role }),
    ]);

  const sinClases = students.filter((s) => s.status === "ACTIVA" && s.available === 0);

  return (
    <div className="space-y-6">
      <PageTitle title={`Hoy, ${WEEKDAY_LABELS[weekday].toLowerCase()} ${formatYMD(today)}`} />

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-2xl font-semibold">{activities.length}</p>
          <p className="text-sm text-tinta-suave">Clases hoy</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{attendancesToday.length}</p>
          <p className="text-sm text-tinta-suave">Asistencias registradas</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{sinClases.length}</p>
          <p className="text-sm text-tinta-suave">Alumnas sin clases</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{expiredPacks}</p>
          <p className="text-sm text-tinta-suave">Packs vencidos</p>
        </Card>
      </div>

      {/* Clases del día */}
      <section>
        <h2 className="mb-2 font-medium text-tinta">Clases del día</h2>
        {activities.length === 0 ? (
          <EmptyState title="Hoy no hay clases programadas." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {activities.map((a) => {
              const marcadas = attendancesToday.filter(
                (t) => t.activity.name === a.name && t.activity.startTime === a.startTime,
              );
              return (
                <Card key={a.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {a.startTime} · {a.name}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {a.teacher?.name ?? "Sin profesora"} · {marcadas.length} asistencia
                      {marcadas.length === 1 ? "" : "s"}
                      {a.capacity ? ` · cupo ${a.capacity}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/gestion/asistencia?fecha=${today}&disciplina=${a.disciplineId}&horario=${a.id}`}
                    className="shrink-0 rounded-lg bg-tinta px-3 py-2 text-sm text-crema"
                  >
                    Tomar lista
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Alertas de gestión */}
        <section className="space-y-4">
          <div>
            <h2 className="mb-2 font-medium text-tinta">Alumnas sin clases disponibles</h2>
            {sinClases.length === 0 ? (
              <EmptyState title="Todas las alumnas activas tienen clases." />
            ) : (
              <Card className="divide-y divide-borde p-0">
                {sinClases.slice(0, 8).map((s) => (
                  <Link
                    key={s.id}
                    href={`/gestion/alumnas/${s.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-arena-claro/50"
                  >
                    <span>
                      {s.lastName}, {s.firstName}
                    </span>
                    <Badge tone="alerta">Sin clases</Badge>
                  </Link>
                ))}
              </Card>
            )}
          </div>

          <div>
            <h2 className="mb-2 font-medium text-tinta">Packs por vencer (7 días)</h2>
            {expiringPacks.length === 0 ? (
              <EmptyState title="Ningún pack vence esta semana." />
            ) : (
              <Card className="divide-y divide-borde p-0">
                {expiringPacks.map((p) => (
                  <Link
                    key={p.id}
                    href={`/gestion/alumnas/${p.student.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-arena-claro/50"
                  >
                    <span>
                      {p.student.lastName}, {p.student.firstName}
                      <span className="text-tinta-suave"> · {p.product.name}</span>
                    </span>
                    <Badge tone="aviso">vence {formatYMD(dateToYMD(p.expiresAt))}</Badge>
                  </Link>
                ))}
              </Card>
            )}
          </div>

          {user.role === "ADMIN" && (
            <div>
              <h2 className="mb-2 font-medium text-tinta">Pagos pendientes</h2>
              {pendingPayments.length === 0 ? (
                <EmptyState title="No hay pagos pendientes." />
              ) : (
                <Card className="divide-y divide-borde p-0">
                  {pendingPayments.map((p) => (
                    <Link
                      key={p.id}
                      href={`/gestion/alumnas/${p.student.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-arena-claro/50"
                    >
                      <span>
                        {p.student.lastName}, {p.student.firstName}
                        {p.concept && (
                          <span className="text-tinta-suave"> · {p.concept}</span>
                        )}
                      </span>
                      <Badge tone="aviso">
                        {p.status === "PARCIAL" ? "Parcial" : "Pendiente"}
                      </Badge>
                    </Link>
                  ))}
                </Card>
              )}
            </div>
          )}
        </section>

        {/* Últimas operaciones */}
        <section>
          <h2 className="mb-2 font-medium text-tinta">Últimas operaciones</h2>
          {lastMovements.length === 0 ? (
            <EmptyState title="Todavía no hay movimientos." />
          ) : (
            <Card className="divide-y divide-borde p-0">
              {lastMovements.map((m) => (
                <div key={m.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {LEDGER_TYPE_LABEL[m.type] ?? m.type}
                    </span>
                    <span
                      className={
                        m.delta >= 0 ? "text-sm font-semibold text-exito" : "text-sm font-semibold text-alerta"
                      }
                    >
                      {m.delta >= 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </div>
                  <p className="text-sm text-tinta-suave">
                    {m.student.lastName}, {m.student.firstName} · {m.createdBy.name} ·{" "}
                    {formatDateTimeAR(m.createdAt)}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
