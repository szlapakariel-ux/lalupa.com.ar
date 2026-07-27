import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { packsWithBalances, availableBalance } from "@/server/services/ledger";
import { todayYMD, WEEKDAY_LABELS, weekdayOfYMD } from "@/lib/dates";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { TakeClassForm } from "./take-class-form";

export const dynamic = "force-dynamic";

export default async function TomarClasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) notFound();

  const today = todayYMD();
  // Solo horarios de disciplinas donde la alumna tiene inscripción ACTIVA.
  const [enrollments, packs] = await Promise.all([
    prisma.studentDisciplineEnrollment.findMany({
      where: { studentId: id, active: true, discipline: { active: true } },
      select: { disciplineId: true },
    }),
    packsWithBalances(prisma, id),
  ]);
  const enrolledIds = enrollments.map((e) => e.disciplineId);

  const activities = await prisma.activity.findMany({
    where: { active: true, disciplineId: { in: enrolledIds } },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      weekday: true,
      startTime: true,
      disciplineId: true,
      discipline: { select: { name: true } },
    },
  });

  // Horarios de hoy primero (lo más probable en el uso diario)
  const todayWeekday = weekdayOfYMD(today);
  const sorted = [
    ...activities.filter((a) => a.weekday === todayWeekday),
    ...activities.filter((a) => a.weekday !== todayWeekday),
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title={`Tomó clase — ${student.lastName}, ${student.firstName}`} />
      {enrolledIds.length === 0 ? (
        <EmptyState
          title="La alumna no tiene inscripciones activas."
          hint="Inscribila en una disciplina desde su ficha antes de registrar asistencia."
        />
      ) : (
        <Card>
          <TakeClassForm
            studentId={student.id}
            isAdmin={user.role === "ADMIN"}
            today={today}
            activities={sorted.map((a) => ({
              id: a.id,
              label: `${a.discipline.name} · ${WEEKDAY_LABELS[a.weekday]} ${a.startTime}`,
              weekday: a.weekday,
              balance: availableBalance(packs, a.disciplineId, today),
            }))}
          />
        </Card>
      )}
    </div>
  );
}
