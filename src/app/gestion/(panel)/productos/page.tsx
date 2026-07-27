import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { formatARS } from "@/lib/dates";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { ProductForm } from "./product-form";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  await requirePageUser("ADMIN");
  const [products, disciplines] = await Promise.all([
    prisma.packProduct.findMany({
      include: { discipline: { select: { name: true } } },
      orderBy: [{ active: "desc" }, { classCount: "asc" }],
    }),
    prisma.discipline.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle title="Packs y precios" />

      {products.length === 0 ? (
        <EmptyState title="Sin productos configurados." hint="Creá el primero abajo." />
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {p.name}
                    <span className="ml-2 text-sm text-tinta-suave">
                      {p.classCount} clase{p.classCount === 1 ? "" : "s"} ·{" "}
                      {formatARS(p.referencePrice.toString())} · {p.validityDays} días
                    </span>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {p.discipline
                      ? `Solo ${p.discipline.name} (cualquier horario)`
                      : "Aplica a todas las disciplinas"}
                  </p>
                </div>
                <Badge tone={p.active ? "exito" : "neutral"}>
                  {p.active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-terracota">Editar</summary>
                <div className="mt-3">
                  <ProductForm product={p} disciplines={disciplines} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <details>
          <summary className="cursor-pointer font-medium text-terracota">
            + Nuevo producto
          </summary>
          <div className="mt-3">
            <ProductForm disciplines={disciplines} />
          </div>
        </details>
      </Card>
    </div>
  );
}
