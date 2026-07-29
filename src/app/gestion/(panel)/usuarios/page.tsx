import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { formatDateTimeAR } from "@/lib/dates";
import { Badge, Card, PageTitle } from "@/components/ui";
import { UserForm } from "./user-form";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const current = await requirePageUser("ADMIN");
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4">
      <PageTitle title="Usuarias" />
      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {u.name}
                  {u.id === current.id && (
                    <span className="ml-2 text-xs text-tinta-suave">(vos)</span>
                  )}
                </p>
                <p className="text-sm text-tinta-suave">
                  {u.email} · alta {formatDateTimeAR(u.createdAt)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Badge tone={u.role === "ADMIN" ? "salvia" : "neutral"}>
                  {u.role === "ADMIN" ? "Administradora" : "Profesora"}
                </Badge>
                <Badge tone={u.active ? "exito" : "alerta"}>
                  {u.active ? "Activa" : "Desactivada"}
                </Badge>
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-terracota">Editar</summary>
              <div className="mt-3">
                <UserForm
                  user={{
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    role: u.role,
                    active: u.active,
                  }}
                  isSelf={u.id === current.id}
                />
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer font-medium text-terracota">
            + Nueva usuaria
          </summary>
          <div className="mt-3">
            <UserForm />
          </div>
        </details>
      </Card>
    </div>
  );
}
