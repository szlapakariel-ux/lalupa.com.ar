import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { packsWithBalances, availableBalance } from "@/server/services/ledger";
import { todayYMD, WEEKDAY_LABELS, weekdayOfYMD } from "@/lib/dates";
import { Card, PageTitle } from "@/components/ui";
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
  const [activities, packs] = await Promise.all([
    prisma.activity.findMany({
      where: { active: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      select: { id: true, name: true, weekday: true, startTime: true },
    }),
    packsWithBalances(prisma, id),
  ]);

  // Actividades de hoy primero (lo más probable en el uso diario)
  const todayWeekday = weekdayOfYMD(today);
  const sorted = [
    ...activities.filter((a) => a.weekday === todayWeekday),
    ...activities.filter((a) => a.weekday !== todayWeekday),
  ];

  const balances = Object.fromEntries(
    sorted.map((a) => [a.id, availableBalance(packs, a.id, today)]),
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title={`Tomó clase — ${student.lastName}, ${student.firstName}`} />
      <Card>
        <TakeClassForm
          studentId={student.id}
          isAdmin={user.role === "ADMIN"}
          today={today}
          activities={sorted.map((a) => ({
            id: a.id,
            label: `${a.name} · ${WEEKDAY_LABELS[a.weekday]} ${a.startTime}`,
            balance: balances[a.id] ?? 0,
          }))}
        />
      </Card>
    </div>
  );
}
