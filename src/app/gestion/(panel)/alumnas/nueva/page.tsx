import { requirePageUser } from "@/server/auth/require-user";
import { PageTitle } from "@/components/ui";
import { StudentForm } from "../student-form";

export default async function NuevaAlumnaPage() {
  await requirePageUser("ADMIN");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title="Nueva alumna" />
      <StudentForm />
    </div>
  );
}
