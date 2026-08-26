import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";
import { NavLinks } from "./nav-links";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

export function AppHeader({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Haij"
            className="transition-opacity hover:opacity-80"
          >
            <Wordmark className="text-lg" />
          </Link>
          <span className="text-border select-none">/</span>
          <OrgSwitcher />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <NavLinks />
          <UserMenu name={userName} email={userEmail} />
        </div>
      </div>
    </header>
  );
}
