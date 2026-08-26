"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Nine destinations, clustered by workflow: overview · relations · delivery ·
 * money · radar. The dividers are purely visual rhythm, not structure.
 */
const GROUPS = [
  [{ href: "/dashboard", key: "dashboard" }],
  [
    { href: "/companies", key: "companies" },
    { href: "/pipeline", key: "pipeline" },
  ],
  [
    { href: "/projects", key: "projects" },
    { href: "/time", key: "time" },
  ],
  [
    { href: "/invoices", key: "invoices" },
    { href: "/economy", key: "economy" },
  ],
  [
    { href: "/signals", key: "signals" },
    { href: "/knowledge", key: "knowledge" },
  ],
] as const;

export function NavLinks() {
  const t = useTranslations("app.nav");
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {GROUPS.map((group, index) => (
        <div key={group[0].href} className="flex shrink-0 items-center gap-1">
          {index > 0 ? (
            <span aria-hidden className="bg-border mx-1 hidden h-4 w-px xl:block" />
          ) : null}
          {group.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
