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
  searchParams: Promise<{ fecha?: string; disciplina?: string; horario?: string; q?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;

  const fecha = params.fecha && isValidYMD(params.fecha) ? params.fecha : todayYMD();
  const weekday = weekdayOfYMD(fecha);

  // Disciplinas activas con TODOS sus horarios activos (para el selector).
  const disciplines = await prisma.discipline.findMany({
    where: { active: true },
    include: {
      activities: {
        where: { active: true },
        include: { teacher: { select: { name: true } } },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const selectedDiscipline =
    disciplines.find((d) => d.id === params.disciplina) ??
    disciplines.find((d) => d.activities.some((a) => a.weekday === weekday)) ??
    disciplines[0] ??
    null;

  // Solo se puede abrir una clase en un horario cuyo día coincide con la fecha.
  const schedulesOfDay =
    selectedDiscipline?.activities.filter((a) => a.weekday === weekday) ?? [];
  const requestedSchedule = selectedDiscipline?.activities.find(
    (a) => a.id === params.horario,
  );
  const weekdayMismatch =
    requestedSchedule && requestedSchedule.weekday !== weekday
      ? requestedSchedule
      : null;
  const selected = weekdayMismatch
    ? null
    : (requestedSchedule ?? schedulesOfDay[0] ?? null);

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
  const markedIds = new Set(
    attendances.filter((a) => !a.revertedAt).map((a) => a.student.id),
  );

  // Alumnas con inscripción ACTIVA en la disciplina (única fuente de la
  // búsqueda), separadas en: habituales de este horario / sin horario /
  // de otros horarios de la misma disciplina.
  const q = params.q?.trim();
  const enrollments =
    selected && selectedDiscipline
      ? await prisma.studentDisciplineEnrollment.findMany({
          where: {
            disciplineId: selectedDiscipline.id,
            active: true,
            student: {
              deletedAt: null,
              ...(q
                ? {
                    OR: [
                      { firstName: { contains: q, mode: "insensitive" } },
                      { lastName: { contains: q, mode: "insensitive" } },
                      { phone: { contains: q } },
                    ],
                  }
                : {}),
            },
          },
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, status: true },
            },
            preferredActivity: {
              select: { id: true, weekday: true, startTime: true },
            },
          },
          orderBy: [{ student: { lastName: "asc" } }],
          take: 100,
        })
      : [];

  const pending = enrollments.filter((e) => !markedIds.has(e.student.id));
  const habituales = pending.filter((e) => e.preferredActivityId === selected?.id);
  const sinHorario = pending.filter((e) => e.preferredActivityId === null);
  const otrosHorarios = pending.filter(
    (e) => e.preferredActivityId !== null && e.preferredActivityId !== selected?.id,
  );

  const balances: Record<string, number> = {};
  if (selected && selectedDiscipline) {
    for (const e of pending) {
      const packs = await packsWithBalances(prisma, e.student.id);
      balances[e.student.id] = availableBalance(packs, selectedDiscipline.id, fecha);
    }
  }

  const grupo = (
    titulo: string,
    lista: typeof pending,
    etiqueta: (e: (typeof pending)[number]) => string | null,
  ) =>
    lista.length > 0 &&
    selected && (
      <Card className="space-y-3">
        <h2 className="font-medium">{titulo}</h2>
        {lista.map((e) => (
          <div key={e.id} className="space-y-1">
            {etiqueta(e) && (
              <p className="text-xs text-tinta-suave">{etiqueta(e)}</p>
            )}
            <MarkAttendanceForm
              studentId={e.student.id}
              studentName={`${e.student.lastName}, ${e.student.firstName}`}
              studentStatus={e.student.status}
              activityId={selected.id}
              dateYMD={fecha}
              balance={balances[e.student.id] ?? 0}
              isAdmin={user.role === "ADMIN"}
            />
          </div>
        ))}
      </Card>
    );

  return (
    <div className="space-y-4">
      <PageTitle title="Clases de hoy" />

      {/* Selección: fecha → disciplina → horario de ese día */}
      <Card>
        <form method="GET" className="grid gap-3 md:grid-cols-4">
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
            <label htmlFor="disciplina" className="mb-1 block text-sm font-medium">
              Disciplina
            </label>
            <select
              id="disciplina"
              name="disciplina"
              defaultValue={selectedDiscipline?.id}
              className={inputClass()}
            >
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="horario" className="mb-1 block text-sm font-medium">
              Horario ({WEEKDAY_LABELS[weekday].toLowerCase()})
            </label>
            <select
              id="horario"
              name="horario"
              defaultValue={selected?.id ?? ""}
              className={inputClass()}
            >
              {schedulesOfDay.length === 0 && (
                <option value="">Sin horarios este día</option>
              )}
              {schedulesOfDay.map((a) => (
                <option key={a.id} value={a.id}>
                  {WEEKDAY_LABELS[a.weekday]} {a.startTime}
                  {a.teacher ? ` — ${a.teacher.name}` : ""}
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

      {disciplines.length === 0 ? (
        <EmptyState
          title="No hay disciplinas configuradas."
          hint="Creá disciplinas y horarios desde el menú para poder tomar asistencia."
        />
      ) : weekdayMismatch ? (
        <EmptyState
          title={`El horario seleccionado corresponde a ${WEEKDAY_LABELS[weekdayMismatch.weekday].toLowerCase()}. Elegí una fecha de ${WEEKDAY_LABELS[weekdayMismatch.weekday].toLowerCase()}.`}
        />
      ) : !selected || !selectedDiscipline ? (
        <EmptyState
          title={`${selectedDiscipline?.name ?? "Esta disciplina"} no tiene horarios los ${WEEKDAY_LABELS[weekday].toLowerCase()}.`}
          hint="Elegí otra fecha u otra disciplina."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            <span className="font-medium text-tinta">
              {selectedDiscipline.name} · {WEEKDAY_LABELS[selected.weekday]}{" "}
              {selected.startTime}
            </span>
            {selected.teacher && <span>Profe: {selected.teacher.name}</span>}
            {selected.capacity && <span>Cupo: {selected.capacity}</span>}
            <Badge tone="neutral">
              {attendances.filter((a) => !a.revertedAt).length} registrada
              {attendances.filter((a) => !a.revertedAt).length === 1 ? "" : "s"}
            </Badge>
          </div>

          {/* Registradas */}
          {attendances.length > 0 && (
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

          {/* Buscar dentro de las inscriptas en la disciplina */}
          <Card className="space-y-2">
            <form method="GET" className="flex gap-2">
              <input type="hidden" name="fecha" value={fecha} />
              <input type="hidden" name="disciplina" value={selectedDiscipline.id} />
              <input type="hidden" name="horario" value={selected.id} />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar entre las inscriptas…"
                aria-label="Buscar alumna inscripta en la disciplina"
                className={inputClass("flex-1")}
              />
              <button type="submit" className={buttonClass("secondary")}>
                Buscar
              </button>
            </form>
            <p className="text-xs text-tinta-suave">
              Solo aparecen alumnas con inscripción activa en{" "}
              {selectedDiscipline.name}. Registrar en otro horario no cambia el
              horario habitual.
            </p>
          </Card>

          {pending.length === 0 && (
            <EmptyState
              title={
                q
                  ? "Sin resultados entre las inscriptas (o ya están marcadas)."
                  : "Todas las inscriptas de esta disciplina ya están marcadas o no hay inscriptas."
              }
            />
          )}

          {grupo("Alumnas habituales de este horario", habituales, () => null)}
          {grupo("Inscriptas sin horario asignado", sinHorario, () => "Horario pendiente")}
          {grupo(
            "De otros horarios de la disciplina",
            otrosHorarios,
            (e) =>
              e.preferredActivity
                ? `Horario habitual: ${WEEKDAY_LABELS[e.preferredActivity.weekday].toLowerCase()} ${e.preferredActivity.startTime}`
                : null,
          )}
        </>
      )}
    </div>
  );
}
