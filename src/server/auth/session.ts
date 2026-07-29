import { createHash, randomBytes } from "crypto";
import { prisma } from "@/server/db";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "lupa_session";
export const SESSION_DAYS = 30;

/** Usuario seguro para pasar a la UI: sin hash de contraseña. */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Valida el token de la cookie contra la DB. Devuelve el usuario o null. */
export async function validateSessionToken(
  token: string | undefined,
): Promise<SafeUser | null> {
  if (!token || token.length !== 64) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  const { id, email, name, role } = session.user;
  return { id, email, name, role };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
