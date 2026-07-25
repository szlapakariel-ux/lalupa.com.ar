import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { availableBalance, packsWithBalances } from "@/server/services/ledger";
import {
  isValidYMD,
  todayYMD,
  weekdayOfYMD,
  WEEKDAY_LABELS,
  ymdToDate,
} from "@/lib/dates";
import {
  ATTENDANCE_STATUS_LABEL,
  Badge,
  Card,
  EmptyState,
  PageTitle,
  buttonClass,
  inputClass,
} from "@/components/ui";
import { MarkAttendanceForm, RevertAttendanceForm } from "./attendance-forms";

export const dynamic = "force-dynamic";

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; actividad?: string; q?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;

  const fecha = params.fecha && isValidYMD(params.fecha) ? params.fecha : todayYMD();
  const weekday = weekdayOfYMD(fecha);

  const activities = await prisma.activity.findMany({
    where: { active: true },
    include: { teacher: { select: { name: true } } },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  const delDia = activities.filter((a) => a.weekday === weekday);
  const selected =
    activities.find((a) => a.id === params.actividad) ?? delDia[0] ?? activities[0] ?? null;

  const attendances = selected
    ? await prisma.attendance.findMany({
        where: { date: ymdToDate(fecha), activityId: selected.id },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          registeredBy: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Búsqueda de alumnas para agregar a la clase
  const q = params.q?.trim();
  const markedIds = new Set(attendances.filter((a) => !a.revertedAt).map((a) => a.student.id));
  const candidates =
    selected && q
      ? (
          await prisma.student.findMany({
            where: {
              deletedAt: null,
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            },
            select: { id: true, firstName: true, lastName: true, status: true },
            orderBy: [{ lastName: "asc" }],
            take: 10,
          })
        ).filter((s) => !markedIds.has(s.id))
      : [];

  const candidateBalances: Record<string, number> = {};
  for (const c of candidates) {
    const packs = await packsWithBalances(prisma, c.id);
    candidateBalances[c.id] = selected ? availableBalance(packs, selected.id, fecha) : 0;
  }

  const baseQuery = (over: Record<string, string>) => {
    const sp = new URLSearchParams({
      fecha,
      ...(selected ? { actividad: selected.id } : {}),
      ...(q ? { q } : {}),
      ...over,
    });
    return `/gestion/asistencia?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Clases de hoy" />

      {/* Selección de fecha y actividad */}
      <Card>
        <form method="GET" className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="fecha" className="mb-1 block text-sm font-medium">
              Fecha
            </label>
            <input
              id="fecha"
              type="date"
              name="fecha"
              defaultValue={fecha}
              className={inputClass()}
            />
          </div>
          <div>
            <label htmlFor="actividad" className="mb-1 block text-sm font-medium">
              Actividad
            </label>
            <select
              id="actividad"
              name="actividad"
              defaultValue={selected?.id}
              className={inputClass()}
            >
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {WEEKDAY_LABELS[a.weekday]} {a.startTime}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className={buttonClass("secondary", "w-full")}>
              Ver clase
            </button>
          </div>
        </form>
      </Card>

      {!selected ? (
        <EmptyState
          title="No hay actividades configuradas."
          hint="Creá actividades desde el menú para poder tomar asistencia."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            <span className="font-medium text-tinta">
              {selected.name} · {WEEKDAY_LABELS[selected.weekday]} {selected.startTime}
            </span>
            {selected.teacher && <span>Profe: {selected.teacher.name}</span>}
            {selected.capacity && <span>Cupo: {selected.capacity}</span>}
            <Badge tone="neutral">
              {attendances.filter((a) => !a.revertedAt).length} registrada
              {attendances.filter((a) => !a.revertedAt).length === 1 ? "" : "s"}
            </Badge>
          </div>

          {/* Registradas */}
          {attendances.length === 0 ? (
            <EmptyState
              title="Nadie registrado todavía en esta clase."
              hint="Buscá una alumna abajo para marcarla."
            />
          ) : (
            <Card className="divide-y divide-borde p-0">
              {attendances.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className={a.revertedAt ? "opacity-50" : ""}>
                    <p className={`font-medium ${a.revertedAt ? "line-through" : ""}`}>
                      {a.student.lastName}, {a.student.firstName}
                    </p>
                    <p className="text-xs text-tinta-suave">
                      {ATTENDANCE_STATUS_LABEL[a.status]} · registró {a.registeredBy.name}
                    </p>
                  </div>
                  {a.revertedAt ? (
                    <Badge tone="neutral">Revertida</Badge>
                  ) : (
                    <RevertAttendanceForm attendanceId={a.id} />
                  )}
                </div>
              ))}
            </Card>
          )}

          {/* Agregar alumna */}
          <Card className="space-y-3">
            <h2 className="font-medium">Agregar alumna a esta clase</h2>
            <form method="GET" className="flex gap-2">
              <input type="hidden" name="fecha" value={fecha} />
              <input type="hidden" name="actividad" value={selected.id} />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Nombre o teléfono…"
                aria-label="Buscar alumna"
                className={inputClass("flex-1")}
              />
              <button type="submit" className={buttonClass("secondary")}>
                Buscar
              </button>
            </form>

            {q && candidates.length === 0 && (
              <p className="text-sm text-tinta-suave">
                Sin resultados (o ya están marcadas).{" "}
                <a href={baseQuery({ q: "" })} className="text-terracota underline">
                  Limpiar búsqueda
                </a>
              </p>
            )}

            {candidates.map((c) => (
              <MarkAttendanceForm
                key={c.id}
                studentId={c.id}
                studentName={`${c.lastName}, ${c.firstName}`}
                studentStatus={c.status}
                activityId={selected.id}
                dateYMD={fecha}
                balance={candidateBalances[c.id] ?? 0}
                isAdmin={user.role === "ADMIN"}
              />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
