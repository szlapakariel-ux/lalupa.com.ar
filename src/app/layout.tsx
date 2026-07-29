import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Espacio La Lupa",
  description: "Espacio La Lupa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
