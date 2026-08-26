import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { getOrgProfile } from "@/modules/invoicing/profile";
import { redirect } from "@/i18n/navigation";
import { CompanyProfileForm } from "./company-profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orgProfile");
  return { title: t("title") };
}

export default async function CompanySettingsPage() {
  const context = await getOrgContext();
  if (!context) redirect({ href: "/login", locale: await getLocale() });

  const t = await getTranslations("orgProfile");
  const profile = await getOrgProfile(context!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <CompanyProfileForm profile={profile} />
    </div>
  );
}
