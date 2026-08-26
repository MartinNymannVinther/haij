import { getLocale } from "next-intl/server";
import { getSession } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import { AppHeader } from "./app-header";

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
    <div className="flex min-h-svh flex-col">
      <AppHeader userName={session.user.name} userEmail={session.user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
