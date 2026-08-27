import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedFilter } from "@/components/ui/segmented";
import { getOrgContext } from "@/core/auth/session";
import { SIGNAL_STATUSES, type SignalStatus } from "@/core/db/schema";
import { todayInCopenhagen } from "@/core/dates";
import { getSignalSettings, listSignals } from "@/modules/signals/service";
import { redirect } from "@/i18n/navigation";
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
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={configured ? t("summary", { count: counts.new ?? 0 }) : undefined}
        actions={
          <>
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
          </>
        }
      />

      <SegmentedFilter
        className="self-start"
        items={SIGNAL_STATUSES.map((s) => ({
          key: s,
          label: (
            <>
              {t(`status.${s}`)}
              {counts[s] ? <span className="text-label ml-1.5 tabular-nums">{counts[s]}</span> : null}
            </>
          ),
          href: { pathname: "/signals" as const, query: s === "new" ? {} : { status: s } },
          active: active === s,
        }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={configured ? t("empty") : t("unconfiguredTitle")}
          hint={configured ? t("emptyHint") : t("unconfiguredHint")}
        />
      ) : (
        <div className="grid gap-3 @3xl:grid-cols-2">
          {rows.map((signal) => (
            <SignalCard key={signal.id} signal={signal} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
