import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";
import { NavLinks } from "./nav-links";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

export function AppHeader({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <header className="bg-background border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" aria-label="Haij">
            <Wordmark className="text-lg" />
          </Link>
          <span className="text-border">/</span>
          <OrgSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <NavLinks />
          <UserMenu name={userName} email={userEmail} />
        </div>
      </div>
    </header>
  );
}
