"use client";

import { Languages, LogOut, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/core/auth/client";
import { usePathname, useRouter } from "@/i18n/navigation";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations("app.nav");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" className="rounded-full text-xs font-semibold">
            {initials(name)}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{name}</span>
          <span className="text-muted-foreground block truncate text-xs font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings/security")}>
          <ShieldCheck data-slot="icon" />
          {t("security")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.replace(pathname, { locale: locale === "da" ? "en" : "da" })}
        >
          <Languages data-slot="icon" />
          {locale === "da" ? t("english") : t("danish")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout}>
          <LogOut data-slot="icon" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
