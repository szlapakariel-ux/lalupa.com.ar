"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  /** Solo en la lista vertical (desktop) o en "Más" */
  secondary?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/gestion", label: "Inicio", icon: "⌂" },
  { href: "/gestion/alumnas", label: "Alumnas", icon: "☺" },
  { href: "/gestion/asistencia", label: "Asistencia", icon: "✓" },
  { href: "/gestion/pagos", label: "Pagos", icon: "$", adminOnly: true },
  { href: "/gestion/actividades", label: "Actividades", icon: "◷", secondary: true },
  { href: "/gestion/productos", label: "Packs y precios", icon: "▦", secondary: true, adminOnly: true },
  { href: "/gestion/usuarios", label: "Usuarias", icon: "⚙", secondary: true, adminOnly: true },
  { href: "/gestion/auditoria", label: "Auditoría", icon: "≡", secondary: true, adminOnly: true },
  { href: "/gestion/configuracion", label: "Configuración", icon: "✎", secondary: true, adminOnly: true },
  { href: "/gestion/mas", label: "Más", icon: "⋯", secondary: false },
];

export function PanelNav({
  role,
  orientation,
}: {
  role: "ADMIN" | "TEACHER";
  orientation: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  const visible = ITEMS.filter((i) => !i.adminOnly || role === "ADMIN");

  const isActive = (href: string) =>
    href === "/gestion" ? pathname === "/gestion" : pathname.startsWith(href);

  if (orientation === "vertical") {
    const items = visible.filter((i) => i.href !== "/gestion/mas");
    return (
      <div className="flex flex-col gap-0.5 px-3 py-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              isActive(item.href)
                ? "bg-arena-claro font-medium text-tinta"
                : "text-tinta-suave hover:bg-arena-claro/60 hover:text-tinta",
            )}
          >
            <span aria-hidden className="mr-2 inline-block w-4 text-center">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </div>
    );
  }

  // Bottom nav mobile: máximo 5 accesos grandes
  const primary = visible.filter((i) => !i.secondary).slice(0, 5);
  return (
    <div className="grid auto-cols-fr grid-flow-col">
      {primary.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cx(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
            isActive(item.href) ? "font-semibold text-terracota-oscuro" : "text-tinta-suave",
          )}
        >
          <span aria-hidden className="text-base leading-none">
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
    </div>
  );
}
