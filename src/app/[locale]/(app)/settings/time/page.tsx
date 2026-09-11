import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { getTimeSettings } from "@/modules/time/settings";
import { redirect } from "@/i18n/navigation";
import { TimeSettingsForm } from "./time-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("time.settings");
  return { title: t("title") };
}

export default async function TimeSettingsPage() {
  const context = await getOrgContext();
  if (!context) redirect({ href: "/login", locale: await getLocale() });

  const [t, settings] = await Promise.all([
    getTranslations("time.settings"),
    getTimeSettings(context!),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-[0.78rem] leading-relaxed">{t("hint")}</p>
      </div>
      <TimeSettingsForm prefillFromLastEntry={settings.prefillFromLastEntry} />
    </div>
  );
}
