import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { todayYMD } from "@/lib/dates";
import { Card, PageTitle } from "@/components/ui";
import { PackForm } from "./pack-form";

export const dynamic = "force-dynamic";

export default async function CargarPackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageUser("ADMIN");
  const { id } = await params;
  const [student, products] = await Promise.all([
    prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.packProduct.findMany({
      where: { active: true },
      include: { discipline: { select: { name: true } } },
      orderBy: { classCount: "asc" },
    }),
  ]);
  if (!student) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title={`Cargar pack — ${student.lastName}, ${student.firstName}`} />
      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-tinta-suave">
            No hay productos activos.{" "}
            <Link href="/gestion/productos" className="text-terracota underline">
              Configurá los packs primero
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          <PackForm
            studentId={student.id}
            today={todayYMD()}
            products={products.map((p) => ({
              id: p.id,
              name: p.discipline ? `${p.name} (${p.discipline.name})` : p.name,
              classCount: p.classCount,
              referencePrice: Number(p.referencePrice),
              validityDays: p.validityDays,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
