import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["da", "en"],
  defaultLocale: "da",
  // Danish is served without a URL prefix (/dashboard), English under /en.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
