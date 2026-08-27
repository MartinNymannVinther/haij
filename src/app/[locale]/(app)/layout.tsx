import { getLocale } from "next-intl/server";
import { getSession } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import { AppSidebar } from "./app-sidebar";
import { MobileHeader } from "./mobile-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const locale = await getLocale();
  if (!session) {
    redirect({ href: "/login", locale });
    return null;
  }
  if (!session.session.activeOrganizationId) {
    redirect({ href: "/onboarding", locale });
    return null;
  }

  return (
    <div className="flex min-h-svh">
      <AppSidebar userName={session.user.name} userEmail={session.user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader userName={session.user.name} userEmail={session.user.email} />
        <main className="@container mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
