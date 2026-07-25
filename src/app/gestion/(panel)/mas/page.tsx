import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-user";
import { Card, PageTitle } from "@/components/ui";

export default async function MasPage() {
  const user = await requirePageUser();
  const isAdmin = user.role === "ADMIN";

  const links = [
    { href: "/gestion/actividades", label: "Actividades", desc: "Días, horarios y profesoras" },
    ...(isAdmin
      ? [
          { href: "/gestion/productos", label: "Packs y precios", desc: "Productos y vigencias" },
          { href: "/gestion/usuarios", label: "Usuarias", desc: "Cuentas y roles" },
          { href: "/gestion/auditoria", label: "Auditoría", desc: "Registro de acciones" },
          { href: "/gestion/configuracion", label: "Configuración", desc: "Reglas de consumo" },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageTitle title="Más opciones" />
      <div className="space-y-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="block">
            <Card className="hover:border-terracota">
              <p className="font-medium">{l.label}</p>
              <p className="text-sm text-tinta-suave">{l.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
