import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { getOrgLogo } from "@/modules/invoicing/logo";
import { getOrgProfile } from "@/modules/invoicing/profile";
import { listRoles } from "@/modules/invoicing/roles";
import { redirect } from "@/i18n/navigation";
import { CompanyProfileForm } from "./company-profile-form";
import { LogoCard } from "./logo-card";
import { RolesManager } from "./roles-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orgProfile");
  return { title: t("title") };
}

export default async function CompanySettingsPage() {
  const context = await getOrgContext();
  if (!context) redirect({ href: "/login", locale: await getLocale() });

  const [t, profile, roles, logo] = await Promise.all([
    getTranslations("orgProfile"),
    getOrgProfile(context!),
    listRoles(context!),
    getOrgLogo(context!),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <CompanyProfileForm profile={profile} />
      <LogoCard logoDataUrl={logo?.dataUrl ?? null} />
      <RolesManager roles={roles} />
    </div>
  );
}
