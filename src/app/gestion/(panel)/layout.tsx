import Link from "next/link";
import { requirePageUser } from "@/server/auth/require-user";
import { logoutAction } from "@/server/actions/auth";
import { PanelNav } from "./panel-nav";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar en pantallas medianas y grandes */}
      <aside className="hidden w-56 shrink-0 border-r border-borde bg-papel md:flex md:flex-col">
        <div className="border-b border-borde px-5 py-5">
          <Link href="/gestion" className="font-serif text-xl text-tinta">
            La Lupa
          </Link>
          <p className="text-xs text-tinta-suave">Gestión interna</p>
        </div>
        <PanelNav role={user.role} orientation="vertical" />
        <div className="mt-auto border-t border-borde px-5 py-4">
          <p className="truncate text-sm font-medium text-tinta">{user.name}</p>
          <p className="text-xs text-tinta-suave">
            {user.role === "ADMIN" ? "Administradora" : "Profesora"}
          </p>
          <form action={logoutAction} className="mt-2">
            <button
              type="submit"
              className="text-sm text-terracota underline-offset-2 hover:underline"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Header compacto en celular */}
        <header className="flex items-center justify-between border-b border-borde bg-papel px-4 py-3 md:hidden">
          <Link href="/gestion" className="font-serif text-lg text-tinta">
            La Lupa
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-terracota">
              Salir
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>

        {/* Bottom nav fija en celular */}
        <nav
          aria-label="Navegación principal"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-papel md:hidden"
        >
          <PanelNav role={user.role} orientation="horizontal" />
        </nav>
      </div>
    </div>
  );
}
