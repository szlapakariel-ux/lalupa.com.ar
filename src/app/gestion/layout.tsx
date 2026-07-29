import type { Metadata } from "next";

// Todo /gestion queda fuera de los buscadores (además del header X-Robots-Tag).
export const metadata: Metadata = {
  title: "Gestión — La Lupa",
  robots: { index: false, follow: false },
};

export default function GestionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
