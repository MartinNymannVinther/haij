import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";
import { OrgSwitcher } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/** Desktop navigation rail: brand and org on top, nav in the middle, user at the bottom. */
export function AppSidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <aside className="bg-sidebar sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="flex flex-col gap-1 px-4 pt-5 pb-2">
        <Link
          href="/dashboard"
          aria-label="Haij"
          className="w-fit transition-opacity hover:opacity-80"
        >
          <Wordmark className="text-xl" />
        </Link>
      </div>
      <div className="px-3 pb-1">
        <OrgSwitcher triggerClassName="w-full justify-between px-2.5" />
      </div>
      <SidebarNav />
      <div className="border-t p-2">
        <UserMenu name={userName} email={userEmail} variant="row" />
      </div>
    </aside>
  );
}
