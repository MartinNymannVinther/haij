import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export default function proxy(request: NextRequest) {
  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next.js internals and static files.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
