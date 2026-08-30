import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { getSignalSettings } from "@/modules/signals/service";
import { redirect } from "@/i18n/navigation";
import { SignalsForm } from "./signals-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signals.settings");
  return { title: t("title") };
}

export default async function SignalsSettingsPage() {
  const context = await getOrgContext();
  if (!context) redirect({ href: "/login", locale: await getLocale() });

  const [t, settings] = await Promise.all([
    getTranslations("signals.settings"),
    getSignalSettings(context!),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-[0.78rem] leading-relaxed">{t("hint")}</p>
      </div>
      <SignalsForm
        settings={{
          serviceProfile: settings?.serviceProfile ?? "",
          tedKeywords: settings?.tedKeywords ?? "",
          cvrBranchePrefixes: settings?.cvrBranchePrefixes ?? "",
          rssFeeds: Array.isArray(settings?.rssFeeds)
            ? (settings!.rssFeeds as Array<{ url: string; label?: string | null }>).map((feed) => ({
                url: feed.url,
                label: feed.label ?? null,
              }))
            : [],
        }}
      />
    </div>
  );
}
