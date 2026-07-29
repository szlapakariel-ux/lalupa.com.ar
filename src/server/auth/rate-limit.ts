import { prisma } from "@/server/db";

// Rate limit de login basado en DB (funciona con múltiples instancias):
// - por EMAIL: 5 intentos fallidos en 15 minutos (protección principal);
// - por IP: 30 intentos fallidos en 15 minutos (red de contención más
//   gruesa contra barridos de muchas cuentas desde un mismo origen).
export const LOGIN_MAX_FAILURES_EMAIL = 5;
export const LOGIN_MAX_FAILURES_IP = 30;
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
  return byEmail >= LOGIN_MAX_FAILURES_EMAIL || byIp >= LOGIN_MAX_FAILURES_IP;
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
