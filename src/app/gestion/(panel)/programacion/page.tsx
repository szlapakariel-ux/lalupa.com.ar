import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePageUser } from "@/server/auth/require-user";
import { Badge, Card, EmptyState, LinkButton, PageTitle, buttonClass } from "@/components/ui";
import { bootstrapPublicProgramming } from "@/server/actions/public-programming";

export const dynamic = "force-dynamic";
export default async function ProgramacionPage() {
  await requirePageUser("ADMIN");
  const items = await prisma.publicExperience.findMany({ include: { _count: { select: { images:true } } }, orderBy:[{position:"asc"},{createdAt:"asc"}] });
  return <div className="space-y-4">
    <PageTitle title="Programación web" action={<LinkButton href="/gestion/programacion/nueva">+ Nueva experiencia</LinkButton>} />
    <p className="text-sm text-tinta-suave">Este contenido aparece en la sección “Programación actual” de lalupa.com.ar.</p>
    {!items.length ? <EmptyState title="Todavía no hay experiencias." action={<form action={bootstrapPublicProgramming}><button className={buttonClass("primary")}>Cargar contenido actual</button></form>} /> :
      <div className="space-y-3">{items.map((item) => <Link href={`/gestion/programacion/${item.id}`} key={item.id}><Card className="mb-3 hover:border-terracota"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{item.title}</p><p className="text-sm text-tinta-suave">{item.category} · {item._count.images} imágenes · orden {item.position}</p></div><Badge tone={item.published ? "exito":"neutral"}>{item.published ? "Publicada":"Borrador"}</Badge></div></Card></Link>)}</div>}
  </div>;
}
