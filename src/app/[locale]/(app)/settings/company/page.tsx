import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { getOrgLogo } from "@/modules/invoicing/logo";
import { getOrgProfile } from "@/modules/invoicing/profile";
import { getNextInvoiceNumber } from "@/modules/invoicing/numbering";
import { listRoles } from "@/modules/invoicing/roles";
import { redirect } from "@/i18n/navigation";
import { CompanyProfileForm } from "./company-profile-form";
import { LogoCard } from "./logo-card";
import { NumberingCard } from "./numbering-card";
import { RolesManager } from "./roles-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orgProfile");
  return { title: t("title") };
}

export default async function CompanySettingsPage() {
  const context = await getOrgContext();
  if (!context) redirect({ href: "/login", locale: await getLocale() });

  const [t, profile, roles, logo, nextNumber] = await Promise.all([
    getTranslations("orgProfile"),
    getOrgProfile(context!),
    listRoles(context!),
    getOrgLogo(context!),
    getNextInvoiceNumber(context!),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-[0.78rem] leading-relaxed">{t("subtitle")}</p>
      </div>
      <CompanyProfileForm profile={profile} />
      <LogoCard logoDataUrl={logo?.dataUrl ?? null} />
      <RolesManager roles={roles} />
      <NumberingCard nextNumber={nextNumber} />
    </div>
  );
}
