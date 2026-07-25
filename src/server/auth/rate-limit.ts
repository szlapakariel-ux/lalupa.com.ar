import { prisma } from "@/server/db";

// 5 intentos fallidos en 15 minutos por email O por IP bloquean el login.
// Basado en DB: funciona con múltiples instancias y sin dependencias externas.
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MINUTES = 15;

export async function isLoginBlocked(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { email: email.toLowerCase(), success: false, createdAt: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } },
    }),
  ]);
  return byEmail >= LOGIN_MAX_FAILURES || byIp >= LOGIN_MAX_FAILURES;
}

export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { email: email.toLowerCase(), ip, success },
  });
}
