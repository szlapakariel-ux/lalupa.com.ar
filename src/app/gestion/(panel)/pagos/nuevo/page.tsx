import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { todayYMD } from "@/lib/dates";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { PaymentForm } from "./payment-form";

export const dynamic = "force-dynamic";

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ alumna?: string }>;
}) {
  await requirePageUser("ADMIN");
  const params = await searchParams;
  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title="Registrar pago" />
      {students.length === 0 ? (
        <EmptyState title="Primero cargá una alumna." />
      ) : (
        <Card>
          <PaymentForm
            today={todayYMD()}
            preselected={params.alumna}
            students={students.map((s) => ({
              id: s.id,
              label: `${s.lastName}, ${s.firstName}`,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
