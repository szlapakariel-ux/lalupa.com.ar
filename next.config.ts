import type { NextConfig } from "next";
import path from "node:path";

// Encabezados de seguridad solo para el área privada /gestion.
// La página pública en "/" queda intacta e indexable.
const gestionHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "65mb" } },
  // El type-check del build cubre SOLO el código de la aplicación: los
  // tests y sus configs importan devDependencies (vitest, playwright,
  // embedded-postgres) que — correctamente — no existen en la instalación
  // productiva (NODE_ENV=production omite devDependencies), y romperían
  // `next build` en Railway. La cobertura completa, tests incluidos, la da
  // `npm run typecheck` con el tsconfig.json completo.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // Evita que Next infiera mal la raíz del workspace si existen otros
  // lockfiles fuera del proyecto.
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return {
      // El sitio público original (public/index.html, sin modificaciones)
      // se sirve tal cual en la raíz.
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/gestion", headers: gestionHeaders },
      { source: "/gestion/:path*", headers: gestionHeaders },
    ];
  },
};

export default nextConfig;
