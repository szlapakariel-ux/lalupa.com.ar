import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { DomainError } from "@/lib/errors";
import { SESSION_COOKIE, validateSessionToken, type SafeUser } from "./session";

/**
 * Usuario de la sesión actual o null. Cacheado por request para no
 * consultar la DB varias veces en un mismo render.
 */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const cookieStore = await cookies();
  return validateSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
});

/**
 * Frontera de autorización REAL (server-side). El middleware solo redirige
 * por conveniencia; toda página y server action pasa por acá.
 */
export async function requireUser(role?: Role): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/gestion/login");
  if (role && user.role !== role) {
    throw new DomainError("NO_AUTORIZADO", `Se requiere rol ${role}.`);
  }
  return user;
}

/** Igual que requireUser pero redirige al inicio si el rol no alcanza (para páginas). */
export async function requirePageUser(role?: Role): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/gestion/login");
  if (role && user.role !== role) redirect("/gestion");
  return user;
}

/** IP del cliente para auditoría y rate limit. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || h.get("x-real-ip") || "desconocida";
}
