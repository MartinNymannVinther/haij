"use client";

import {
  BookOpen,
  Building2,
  Clock,
  FileText,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  Radar,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The app navigation, grouped by workflow. Rendered in the desktop sidebar
 * and inside the mobile sheet; `onNavigate` lets the sheet close itself.
 */
const SECTIONS: Array<{
  labelKey: "sales" | "work" | "economy" | "insight" | null;
  items: Array<{ href: string; key: string; icon: LucideIcon }>;
}> = [
  { labelKey: null, items: [{ href: "/dashboard", key: "dashboard", icon: LayoutDashboard }] },
  {
    labelKey: "sales",
    items: [
      { href: "/companies", key: "companies", icon: Building2 },
      { href: "/pipeline", key: "pipeline", icon: KanbanSquare },
    ],
  },
  {
    labelKey: "work",
    items: [
      { href: "/projects", key: "projects", icon: FolderKanban },
      { href: "/time", key: "time", icon: Clock },
    ],
  },
  {
    labelKey: "economy",
    items: [
      { href: "/invoices", key: "invoices", icon: FileText },
      { href: "/economy", key: "economy", icon: TrendingUp },
    ],
  },
  {
    labelKey: "insight",
    items: [
      { href: "/signals", key: "signals", icon: Radar },
      { href: "/knowledge", key: "knowledge", icon: BookOpen },
    ],
  },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const tGroups = useTranslations("app.navGroups");
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
      {SECTIONS.map((section, index) => (
        <div key={section.labelKey ?? index} className="flex flex-col gap-0.5">
          {section.labelKey ? (
            <p className="text-muted-foreground/80 px-2.5 pb-1 text-[0.7rem] font-medium tracking-wider uppercase">
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
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn("size-4 shrink-0", active ? "text-primary" : "opacity-70")}
                />
                {t(item.key as never)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
