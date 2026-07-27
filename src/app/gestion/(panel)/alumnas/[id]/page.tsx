import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { getStudentDetail } from "@/server/queries";
import {
  WEEKDAY_LABELS,
  dateToYMD,
  formatARS,
  formatDateTimeAR,
  formatYMD,
  todayYMD,
} from "@/lib/dates";
import { sumBalance } from "@/lib/policy";
import {
  ALERT_TYPE_LABEL,
  ATTENDANCE_STATUS_LABEL,
  Badge,
  Card,
  EmptyState,
  LEDGER_TYPE_LABEL,
  LinkButton,
  PACK_STATUS_BADGE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_BADGE,
  PageTitle,
  STUDENT_STATUS_BADGE,
} from "@/components/ui";
import { AlertForm, AlertToggle } from "./alert-form";
import { CorrectionForm } from "./correction-form";
import {
  EnrollForm,
  PreferredScheduleForm,
  ToggleEnrollmentForm,
} from "./enrollment-forms";

export const dynamic = "force-dynamic";

export default async function FichaAlumnaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const detail = await getStudentDetail(id, user.role);
  if (!detail) notFound();
  const { student, ledger, auditEvents } = detail;

  // Disciplinas activas con sus horarios activos: opciones de inscripción
  // y de horario habitual (las profesoras solo pueden asignar los propios).
  const activeDisciplines = await prisma.discipline.findMany({
    where: { active: true },
    include: {
      activities: {
        where: { active: true },
        include: { teacher: { select: { id: true, name: true } } },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const today = todayYMD();
  const isAdmin = user.role === "ADMIN";
  const estadoBadge = STUDENT_STATUS_BADGE[student.status];

  const packsWithBalance = student.packs.map((p) => ({
    ...p,
    balance: sumBalance(p.ledger),
    expiresYMD: dateToYMD(p.expiresAt),
    startYMD: dateToYMD(p.startDate),
  }));
  const disponibles = packsWithBalance
    .filter((p) => p.status === "ACTIVO" && p.expiresYMD >= today)
    .reduce((acc, p) => acc + p.balance, 0);
  const compradas = packsWithBalance.reduce(
    (acc, p) => acc + p.ledger.filter((m) => m.delta > 0 && m.type === "PACK_PURCHASE").reduce((a, m) => a + m.delta, 0),
    0,
  );
  const usadas = packsWithBalance.reduce(
    (acc, p) =>
      acc + p.ledger.filter((m) => m.type === "CLASS_USED").reduce((a, m) => a + Math.abs(m.delta), 0),
    0,
  );
  const activeAlerts = student.alerts.filter((a) => a.active);

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${student.lastName}, ${student.firstName}`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/gestion/alumnas/${student.id}/tomar-clase`}>
              Tomó clase
            </LinkButton>
            {isAdmin && (
              <LinkButton href={`/gestion/alumnas/${student.id}/pack`} variant="secondary">
                Pack / pago
              </LinkButton>
            )}
          </div>
        }
      />

      {/* Alertas visibles primero: es lo que la profesora necesita ver */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-alerta/40 bg-alerta-claro px-4 py-3"
            >
              <p className="text-sm font-semibold text-alerta">
                ⚠ {ALERT_TYPE_LABEL[a.type]} — {a.title}
              </p>
              {a.instruction && (
                <p className="mt-0.5 text-sm text-tinta">{a.instruction}</p>
              )}
              {isAdmin && (
                <p className="mt-1 text-xs text-tinta-suave">
                  {a.visibility === "SOLO_ADMIN" ? "Visible solo para administradoras" : "Visible para el equipo"}{" "}
                  · cargada el {formatDateTimeAR(a.createdAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Datos + saldo */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Datos</h2>
            <div className="flex items-center gap-2">
              <Badge tone={estadoBadge.tone}>{estadoBadge.label}</Badge>
              {isAdmin && (
                <Link
                  href={`/gestion/alumnas/${student.id}/editar`}
                  className="text-sm text-terracota underline-offset-2 hover:underline"
                >
                  Editar
                </Link>
              )}
            </div>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Teléfono</dt>
              <dd>{student.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Email</dt>
              <dd>{student.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Emergencia</dt>
              <dd>
                {student.emergencyContactName
                  ? `${student.emergencyContactName} (${student.emergencyContactPhone ?? "s/tel"})`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Alta</dt>
              <dd>{formatDateTimeAR(student.createdAt)}</dd>
            </div>
          </dl>
          {student.notes && (
            <p className="rounded-lg bg-arena-claro/60 px-3 py-2 text-sm text-tinta-suave">
              {student.notes}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Clases</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-exito-claro py-3">
              <p className="text-2xl font-bold text-exito">{disponibles}</p>
              <p className="text-xs text-tinta-suave">Disponibles</p>
            </div>
            <div className="rounded-lg bg-arena-claro py-3">
              <p className="text-2xl font-bold">{usadas}</p>
              <p className="text-xs text-tinta-suave">Utilizadas</p>
            </div>
            <div className="rounded-lg bg-arena-claro py-3">
              <p className="text-2xl font-bold">{compradas}</p>
              <p className="text-xs text-tinta-suave">Compradas</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Actividades e inscripciones */}
      <section>
        <h2 className="mb-2 font-medium">Actividades e inscripciones</h2>
        <div className="space-y-2">
          {student.enrollments.length === 0 ? (
            <EmptyState title="Sin inscripciones todavía." />
          ) : (
            student.enrollments.map((e) => {
              const disciplineSchedules =
                activeDisciplines.find((d) => d.id === e.disciplineId)?.activities ??
                [];
              const options = disciplineSchedules
                .filter((a) => isAdmin || a.teacher?.id === user.id)
                .map((a) => ({
                  id: a.id,
                  label: `${WEEKDAY_LABELS[a.weekday]} ${a.startTime}${a.teacher ? ` — ${a.teacher.name}` : ""}`,
                }));
              return (
                <Card key={e.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {e.discipline.name}
                      {!e.discipline.active && (
                        <span className="ml-2 text-xs text-tinta-suave">
                          (disciplina inactiva)
                        </span>
                      )}
                    </p>
                    <Badge tone={e.active ? "exito" : "neutral"}>
                      {e.active ? "Inscripta" : "Inscripción inactiva"}
                    </Badge>
                  </div>
                  <p className="text-sm text-tinta-suave">
                    {e.preferredActivity
                      ? `Horario habitual: ${WEEKDAY_LABELS[e.preferredActivity.weekday]} ${e.preferredActivity.startTime}` +
                        (e.preferredActivity.teacher
                          ? ` · Profe: ${e.preferredActivity.teacher.name}`
                          : "") +
                        (!e.preferredActivity.active ? " (horario desactivado)" : "")
                      : "Horario habitual pendiente de confirmación"}
                  </p>
                  {e.active && (
                    <PreferredScheduleForm
                      enrollmentId={e.id}
                      studentId={student.id}
                      current={e.preferredActivity?.id ?? null}
                      options={options}
                      canClear={isAdmin}
                    />
                  )}
                  {isAdmin && (
                    <ToggleEnrollmentForm
                      enrollmentId={e.id}
                      studentId={student.id}
                      active={e.active}
                    />
                  )}
                </Card>
              );
            })
          )}
          {isAdmin && (
            <Card>
              <h3 className="mb-2 text-sm font-medium">Inscribir en una disciplina</h3>
              <EnrollForm
                studentId={student.id}
                disciplines={activeDisciplines
                  .filter(
                    (d) =>
                      !student.enrollments.some(
                        (e) => e.disciplineId === d.id && e.active,
                      ),
                  )
                  .map((d) => ({ id: d.id, name: d.name }))}
              />
            </Card>
          )}
        </div>
      </section>

      {/* Packs */}
      <section>
        <h2 className="mb-2 font-medium">Packs</h2>
        {packsWithBalance.length === 0 ? (
          <EmptyState
            title="Sin packs cargados."
            action={
              isAdmin ? (
                <LinkButton href={`/gestion/alumnas/${student.id}/pack`}>
                  Cargar pack
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {packsWithBalance.map((p) => {
              const badge = PACK_STATUS_BADGE[p.status];
              return (
                <Card key={p.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {p.product.name}
                      <span className="ml-2 text-sm text-tinta-suave">
                        {p.balance}/{p.classCount} clases · {formatARS(p.agreedPrice.toString())}
                      </span>
                    </p>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                  <p className="text-sm text-tinta-suave">
                    Vigencia {formatYMD(p.startYMD)} – {formatYMD(p.expiresYMD)}
                    {p.notes && ` · ${p.notes}`}
                  </p>
                  {isAdmin && p.status !== "CANCELADO" && (
                    <CorrectionForm studentId={student.id} studentPackId={p.id} />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Alertas: administración */}
      {isAdmin && (
        <section>
          <h2 className="mb-2 font-medium">Alertas y precauciones</h2>
          <div className="space-y-2">
            {student.alerts.length > 0 && (
              <Card className="divide-y divide-borde p-0">
                {student.alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {ALERT_TYPE_LABEL[a.type]} — {a.title}
                        {!a.active && (
                          <span className="ml-2 text-xs text-tinta-suave">(inactiva)</span>
                        )}
                      </p>
                      <p className="text-xs text-tinta-suave">
                        {a.visibility === "SOLO_ADMIN"
                          ? "Solo administradoras"
                          : "Visible para el equipo"}
                      </p>
                    </div>
                    <AlertToggle alertId={a.id} studentId={student.id} active={a.active} />
                  </div>
                ))}
              </Card>
            )}
            <AlertForm studentId={student.id} />
          </div>
        </section>
      )}

      {/* Historiales */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium">Asistencias</h2>
          {student.attendances.length === 0 ? (
            <EmptyState title="Sin asistencias registradas." />
          ) : (
            <Card className="max-h-96 divide-y divide-borde overflow-y-auto p-0">
              {student.attendances.map((a) => (
                <div key={a.id} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className={a.revertedAt ? "line-through opacity-60" : ""}>
                      {formatYMD(dateToYMD(a.date))} · {a.activity.name} ·{" "}
                      {ATTENDANCE_STATUS_LABEL[a.status]}
                    </span>
                    {a.revertedAt && <Badge tone="neutral">Revertida</Badge>}
                  </div>
                  <p className="text-xs text-tinta-suave">
                    Registró {a.registeredBy.name}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Movimientos de clases</h2>
          {ledger.length === 0 ? (
            <EmptyState title="Sin movimientos." />
          ) : (
            <Card className="max-h-96 divide-y divide-borde overflow-y-auto p-0">
              {ledger.map((m) => (
                <div key={m.id} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span>
                      {LEDGER_TYPE_LABEL[m.type] ?? m.type}
                      {m.studentPack && (
                        <span className="text-tinta-suave"> · {m.studentPack.product.name}</span>
                      )}
                    </span>
                    <span className={m.delta >= 0 ? "font-semibold text-exito" : "font-semibold text-alerta"}>
                      {m.delta >= 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </div>
                  <p className="text-xs text-tinta-suave">
                    {formatDateTimeAR(m.createdAt)} · {m.createdBy.name}
                    {m.note && ` · ${m.note}`}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>

      {/* Pagos */}
      <section>
        <h2 className="mb-2 font-medium">Pagos</h2>
        {student.payments.length === 0 ? (
          <EmptyState title="Sin pagos registrados." />
        ) : (
          <Card className="divide-y divide-borde p-0">
            {student.payments.map((p) => {
              const badge = PAYMENT_STATUS_BADGE[p.status];
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {formatARS(p.amount.toString())}
                      <span className="ml-2 text-tinta-suave">
                        {p.concept ?? "—"} · {PAYMENT_METHOD_LABEL[p.method]}
                      </span>
                    </p>
                    <p className="text-xs text-tinta-suave">
                      {formatYMD(dateToYMD(p.date))} · registró {p.createdBy.name}
                    </p>
                  </div>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* Auditoría (solo admin) */}
      {isAdmin && auditEvents.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">Auditoría relevante</h2>
          <Card className="max-h-72 divide-y divide-borde overflow-y-auto p-0">
            {auditEvents.map((e) => (
              <div key={e.id} className="px-4 py-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="text-xs text-tinta-suave">
                    {formatDateTimeAR(e.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-tinta-suave">{e.user?.name ?? "Sistema"}</p>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
