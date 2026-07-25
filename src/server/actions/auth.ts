"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { DOMAIN_ERROR_MESSAGES } from "@/lib/errors";
import { verifyPassword } from "@/server/auth/password";
import { isLoginBlocked, recordLoginAttempt } from "@/server/auth/rate-limit";
import {
  SESSION_COOKIE,
  createSession,
  revokeSession,
  sessionCookieOptions,
} from "@/server/auth/session";
import { clientIp } from "@/server/auth/require-user";
import { audit } from "@/server/services/audit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: DOMAIN_ERROR_MESSAGES.CREDENCIALES_INVALIDAS };
  }
  const { email, password } = parsed.data;
  const ip = await clientIp();

  if (await isLoginBlocked(email, ip)) {
    await audit(prisma, {
      userId: null,
      action: "auth.login",
      entity: "User",
      result: "DENIED",
      metadata: { email, reason: "rate_limit" },
      ip,
    });
    return { error: DOMAIN_ERROR_MESSAGES.DEMASIADOS_INTENTOS };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // verifyPassword compara contra un hash dummy si el usuario no existe,
  // para no revelar cuentas por diferencia de tiempos.
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  const ok = valid && Boolean(user?.active);

  await recordLoginAttempt(email, ip, ok);
  await audit(prisma, {
    userId: ok && user ? user.id : null,
    action: "auth.login",
    entity: "User",
    entityId: ok && user ? user.id : null,
    result: ok ? "OK" : "ERROR",
    metadata: ok ? {} : { email },
    ip,
  });

  if (!ok || !user) {
    return { error: DOMAIN_ERROR_MESSAGES.CREDENCIALES_INVALIDAS };
  }

  const { token, expiresAt } = await createSession(user.id, { ip });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect("/gestion");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  await revokeSession(token);
  cookieStore.delete(SESSION_COOKIE);
  redirect("/gestion/login");
}
