"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The app navigation, grouped by workflow. Text only, per the 2a handoff:
 * the group labels carry the structure, so icons would only add noise.
 * Rendered in the desktop sidebar and inside the mobile sheet, where
 * `onNavigate` lets the sheet close itself.
 */
const SECTIONS: Array<{
  labelKey: "sales" | "work" | "economy" | "insight" | null;
  items: Array<{ href: string; key: string }>;
}> = [
  { labelKey: null, items: [{ href: "/dashboard", key: "dashboard" }] },
  {
    labelKey: "sales",
    items: [
      { href: "/companies", key: "companies" },
      { href: "/pipeline", key: "pipeline" },
    ],
  },
  {
    labelKey: "work",
    items: [
      { href: "/projects", key: "projects" },
      { href: "/time", key: "time" },
    ],
  },
  {
    labelKey: "economy",
    items: [
      { href: "/invoices", key: "invoices" },
      { href: "/economy", key: "economy" },
    ],
  },
  {
    labelKey: "insight",
    items: [
      { href: "/signals", key: "signals" },
      { href: "/knowledge", key: "knowledge" },
    ],
  },
];

export function navItemClass(active: boolean): string {
  return cn(
    "block rounded-[9px] px-3 py-2.5 text-sm transition-colors duration-[120ms] ease-out",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
      : "text-sidebar-foreground hover:bg-sidebar-hover",
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const tGroups = useTranslations("app.navGroups");
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
      {SECTIONS.map((section, index) => (
        <div key={section.labelKey ?? index} className="flex flex-col gap-0.5">
          {section.labelKey ? (
            <p className="text-label px-3 pb-1.5 text-[0.69rem] font-semibold tracking-[0.06em]">
              {tGroups(section.labelKey)}
            </p>
          ) : null}
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={navItemClass(active)}
              >
                {t(item.key as never)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Settings sits apart at the foot of the sidebar, above the user card. */
export function SidebarSettingsLink({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
  return (
    <Link
      href="/settings/company"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={navItemClass(active)}
    >
      {t("settings")}
    </Link>
  );
}
