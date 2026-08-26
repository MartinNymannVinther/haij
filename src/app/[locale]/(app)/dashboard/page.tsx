import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/core/auth/session";
import { organizations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { redirect } from "@/i18n/navigation";
import { PasskeyPrompt } from "./passkey-prompt";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("app.dashboard");
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }

  // Fetched through the application role: RLS only serves the active org.
  const [organization] = await withOrgContext(context, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, context.orgId))
      .limit(1),
  );
  if (!organization) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{organization.name}</p>
      </div>
      <PasskeyPrompt />
      <Card>
        <CardHeader>
          <CardTitle>{t("emptyTitle")}</CardTitle>
          <CardDescription>{t("emptyBody")}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
