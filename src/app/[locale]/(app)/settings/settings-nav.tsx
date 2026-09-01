"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/company", key: "company" },
  { href: "/settings/security", key: "security" },
  { href: "/settings/signals", key: "signals" },
  { href: "/settings/ai", key: "ai" },
  { href: "/settings/about", key: "about" },
] as const;

/** Vertical sub-navigation for settings, mirroring the main nav's active style. */
export function SettingsNav() {
  const t = useTranslations("settings.nav");
  const pathname = usePathname();

  return (
    <nav className="border-border flex gap-1 overflow-x-auto @2xl:w-[210px] @2xl:shrink-0 @2xl:flex-col @2xl:overflow-visible @2xl:border-r @2xl:pr-4">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[9px] px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-[120ms] ease-out",
              active
                ? "bg-accent text-accent-foreground font-semibold"
                : "text-secondary-foreground hover:bg-muted",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
