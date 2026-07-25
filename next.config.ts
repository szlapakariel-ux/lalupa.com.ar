import type { NextConfig } from "next";

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
