import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const socialMetadata = [
  "<!-- SOCIAL_PREVIEW_METADATA_START -->",
  '<meta property="og:type" content="website">',
  '<meta property="og:url" content="https://espacio.lalupa.com.ar/">',
  '<meta property="og:title" content="Espacio La Lupa — Experiencias creativas en grupos reducidos">',
  '<meta property="og:description" content="Talleres y experiencias para crear, aprender y compartir en Núñez, Buenos Aires.">',
  '<meta property="og:image" content="https://espacio.lalupa.com.ar/uploads/hero.jpeg">',
  '<meta property="og:image:width" content="1195">',
  '<meta property="og:image:height" content="896">',
  '<meta property="og:image:alt" content="Frente de Espacio La Lupa, librería y espacio creativo en Núñez">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:title" content="Espacio La Lupa — Experiencias creativas en grupos reducidos">',
  '<meta name="twitter:description" content="Talleres y experiencias para crear, aprender y compartir en Núñez, Buenos Aires.">',
  '<meta name="twitter:image" content="https://espacio.lalupa.com.ar/uploads/hero.jpeg">',
  "<!-- SOCIAL_PREVIEW_METADATA_END -->",
].join("\n");

export async function GET() {
  const original = await readFile(
    path.join(process.cwd(), "public", "index.html"),
  );
  const closingHead = Buffer.from("</head>");
  const headEnd = original.indexOf(closingHead);

  if (headEnd < 0) {
    return new Response("No se pudo servir la portada pública.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const injectedMetadata = Buffer.from(`\n${socialMetadata}\n`);
  const html = Buffer.concat([
    original.subarray(0, headEnd),
    injectedMetadata,
    original.subarray(headEnd),
  ]);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
