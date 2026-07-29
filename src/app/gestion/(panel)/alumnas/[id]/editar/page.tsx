import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { PageTitle } from "@/components/ui";
import { StudentForm } from "../../student-form";

export default async function EditarAlumnaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageUser("ADMIN");
  const { id } = await params;
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
  });
  if (!student) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={`Editar — ${student.lastName}, ${student.firstName}`} />
      <StudentForm student={student} />
    </div>
  );
}
