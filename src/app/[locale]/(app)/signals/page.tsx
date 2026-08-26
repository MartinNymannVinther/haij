import { Radar } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgContext } from "@/core/auth/session";
import { SIGNAL_STATUSES, type SignalStatus } from "@/core/db/schema";
import { todayInCopenhagen } from "@/core/dates";
import { getSignalSettings, listSignals } from "@/modules/signals/service";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { AddSignalDialog } from "./add-signal-dialog";
import { RefreshButton } from "./refresh-button";
import { SignalCard } from "./signal-card";
import { SignalsSettingsDialog } from "./signals-settings-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signals");
  return { title: t("title") };
}

function isStatus(value: string | undefined): value is SignalStatus {
  return Boolean(value) && (SIGNAL_STATUSES as readonly string[]).includes(value!);
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { status } = await searchParams;
  const active = isStatus(status) ? status : "new";
  const [t, settings, { rows, counts }] = await Promise.all([
    getTranslations("signals"),
    getSignalSettings(context),
    listSignals(context, active),
  ]);
  const today = todayInCopenhagen();
  const configured = Boolean(
    settings &&
      (settings.serviceProfile ||
        settings.tedKeywords ||
        settings.cvrBranchePrefixes ||
        (Array.isArray(settings.rssFeeds) && settings.rssFeeds.length > 0)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AddSignalDialog />
          <SignalsSettingsDialog
            settings={{
              serviceProfile: settings?.serviceProfile ?? "",
              tedKeywords: settings?.tedKeywords ?? "",
              cvrBranchePrefixes: settings?.cvrBranchePrefixes ?? "",
              rssFeeds: Array.isArray(settings?.rssFeeds)
                ? (settings!.rssFeeds as Array<{ url: string; label?: string | null }>)
                : [],
            }}
          />
          <RefreshButton disabled={!configured} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SIGNAL_STATUSES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/signals", query: s === "new" ? undefined : { status: s } }}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm transition-colors",
              active === s
                ? "border-transparent bg-accent text-accent-foreground font-medium"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`status.${s}`)}
            {counts[s] ? <span className="text-muted-foreground ml-1.5">{counts[s]}</span> : null}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Radar}
          title={configured ? t("empty") : t("unconfiguredTitle")}
          hint={configured ? t("emptyHint") : t("unconfiguredHint")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((signal) => (
            <SignalCard key={signal.id} signal={signal} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
