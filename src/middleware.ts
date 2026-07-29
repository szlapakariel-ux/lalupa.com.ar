import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "lupa_session";

/**
 * Redirección de conveniencia: sin cookie de sesión no se entra a /gestion.
 * NO es la frontera de seguridad — la validación real contra la base de datos
 * ocurre en requireUser() (layout, páginas y server actions).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/gestion/login";
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isLogin && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/gestion/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isLogin && hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/gestion";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/gestion/:path*", "/gestion"],
};
