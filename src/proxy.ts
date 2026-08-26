import { getSessionCookie } from "better-auth/cookies";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/onboarding"];
const AUTH_PAGES = ["/login", "/register"];

/** Pathname with any locale prefix removed, e.g. /en/login → /login. */
function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

function localizedPath(pathname: string, target: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      if (locale !== routing.defaultLocale) return `/${locale}${target}`;
      break;
    }
  }
  return target;
}

/**
 * Optimistic auth redirects based on the presence of the session cookie.
 * This is UX only — the (app) layout verifies the session for real, and RLS
 * is the actual isolation boundary.
 */
export default function proxy(request: NextRequest) {
  const pathname = stripLocale(request.nextUrl.pathname);
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(request.nextUrl.pathname, "/login");
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(request.nextUrl.pathname, "/dashboard");
    url.search = "";
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next.js internals and static files.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
