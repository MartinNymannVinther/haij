"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";
import { OrgSwitcher } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/** Slim top bar for small screens: burger menu, brand, user. */
export function MobileHeader({ userName, userEmail }: { userName: string; userEmail: string }) {
  const t = useTranslations("app.nav");
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" aria-label={t("openMenu")} />}
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle className="sr-only">{t("menuTitle")}</SheetTitle>
              <div className="px-4 pt-5 pb-2">
                <Wordmark className="text-xl" />
              </div>
              <div className="px-3 pb-1">
                <OrgSwitcher triggerClassName="w-full justify-between px-2.5" />
              </div>
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/dashboard" aria-label="Haij">
            <Wordmark className="text-lg" />
          </Link>
        </div>
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  );
}
