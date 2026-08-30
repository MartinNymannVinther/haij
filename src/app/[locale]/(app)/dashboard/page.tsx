import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgContext, getSession } from "@/core/auth/session";
import { todayInCopenhagen } from "@/core/dates";
import { organizations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { getCrmOverview } from "@/modules/crm/service";
import { getLatestDigest } from "@/modules/knowledge/service";
import { getTopSignal } from "@/modules/signals/service";
import { getUnbilledByCompany } from "@/modules/invoicing/economy";
import { formatOere } from "@/modules/invoicing/money";
import { getInvoicingOverview, listOverdueInvoices } from "@/modules/invoicing/service";
import { formatMinutes, isoWeekMonday, isoWeekNumber, weekDates } from "@/modules/time/duration";
import { listWeek } from "@/modules/time/service";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { AttentionCard } from "./attention-card";
import { PasskeyPrompt } from "./passkey-prompt";
import { WeekChart, type WeekDay } from "./week-chart";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dashboard");
  return { title: t("title") };
}

function Kpi({
  label,
  value,
  footnote,
  tone = "default",
}: {
  label: string;
  value: string;
  footnote?: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 py-0">
        <p className="text-meta text-[0.78rem] font-medium">{label}</p>
        <p
          className={cn(
            "text-[1.875rem] leading-none font-semibold tracking-[-0.02em] tabular-nums",
            tone === "accent" && "text-accent-foreground",
          )}
        >
          {value}
        </p>
        {footnote ? <p className="text-meta text-xs">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}

function ActionRow({
  tone,
  title,
  meta,
  action,
}: {
  tone: "overdue" | "billable" | "neutral";
  title: string;
  meta: string;
  action: React.ReactNode;
}) {
  return (
    <li className="border-hairline flex items-center gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "size-[34px] shrink-0 rounded-[10px]",
          tone === "overdue" && "bg-warning-tint",
          tone === "billable" && "bg-accent",
          tone === "neutral" && "bg-muted",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[0.845rem] leading-snug font-semibold">{title}</p>
        <p className="text-meta text-xs">{meta}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

export default async function DashboardPage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }

  const [t, tTimeline, tStages, session, format] = await Promise.all([
    getTranslations("app.dashboard"),
    getTranslations("crm.timeline"),
    getTranslations("crm.stages"),
    getSession(),
    getFormatter(),
  ]);

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

  const today = todayInCopenhagen();
  const monday = isoWeekMonday(new Date());
  const [overview, invoicing, overdue, unbilled, week, topSignal, digest] = await Promise.all([
    getCrmOverview(context),
    getInvoicingOverview(context),
    listOverdueInvoices(context, 3),
    getUnbilledByCompany(context),
    listWeek(context, monday),
    getTopSignal(context),
    getLatestDigest(context),
  ]);

  const totalCompanies = overview.stages.reduce((sum, row) => sum + row.count, 0);
  const activePipeline = overview.stages
    .filter((row) => ["lead", "dialogue", "proposal"].includes(row.stage))
    .reduce((sum, row) => sum + row.count, 0);

  const days: WeekDay[] = weekDates(monday).map((iso) => {
    const entries = week.filter((entry) => entry.entryDate === iso);
    return {
      iso,
      label: format.dateTime(new Date(`${iso}T12:00:00Z`), { weekday: "short" }).replace(".", ""),
      billableMinutes: entries
        .filter((entry) => entry.companyId)
        .reduce((sum, entry) => sum + entry.durationMinutes, 0),
      internalMinutes: entries
        .filter((entry) => !entry.companyId)
        .reduce((sum, entry) => sum + entry.durationMinutes, 0),
      isToday: iso === today,
      isFuture: iso > today,
    };
  });
  const weekMinutes = days.reduce((sum, day) => sum + day.billableMinutes + day.internalMinutes, 0);
  const billableMinutes = days.reduce((sum, day) => sum + day.billableMinutes, 0);
  const todayMinutes = days.find((day) => day.isToday);
  const minutesToday = (todayMinutes?.billableMinutes ?? 0) + (todayMinutes?.internalMinutes ?? 0);

  const unbilledRows = [...unbilled.values()];
  const unbilledValueOere = unbilledRows.reduce((sum, row) => sum + row.valueOere, 0);
  const unbilledCustomers = unbilledRows.filter((row) => row.valueOere > 0).length;
  const actionCount = overdue.length + (unbilledValueOere > 0 ? 1 : 0);

  function headlineFor(entry: (typeof overview.latest)[number]): string {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    if (entry.type === "stage_change") {
      return tTimeline("stageChanged", {
        from: tStages(String(metadata.from ?? "lead") as never),
        to: tStages(String(metadata.to ?? "lead") as never),
      });
    }
    if (entry.type === "system") {
      if (metadata.event === "invoice_issued" || metadata.event === "credit_note_issued") {
        return tTimeline(
          metadata.event === "invoice_issued" ? "invoiceIssued" : "creditNoteIssued",
          { number: Number(metadata.invoiceNumber ?? 0) },
        );
      }
      return metadata.source === "cvr" ? tTimeline("createdCvr") : tTimeline("createdManual");
    }
    return entry.body ?? "";
  }

  const hour = Number(
    new Intl.DateTimeFormat("da-DK", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/Copenhagen",
    }).format(new Date()),
  );
  const greeting = hour < 10 ? "morning" : hour < 18 ? "day" : "evening";
  const firstName = (session?.user.name ?? "").split(/\s+/)[0] ?? "";

  return (
    <div className="flex flex-col gap-[26px]">
      <PageHeader
        kicker={`${format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" })} · ${t("week", { week: isoWeekNumber(today) })}`}
        title={
          firstName
            ? t(`greeting.${greeting}` as "greeting.morning", { name: firstName })
            : t("title")
        }
        subtitle={t("greetingBody", {
          hours: formatMinutes(minutesToday),
          count: actionCount,
        })}
        actions={
          <>
            <Link href="/time" className={cn(buttonVariants())}>
              {t("actionTrackTime")}
            </Link>
            <Link href="/invoices" className={cn(buttonVariants({ variant: "outline" }))}>
              {t("actionNewInvoice")}
            </Link>
          </>
        }
      />
      <PasskeyPrompt />
      <AttentionCard signal={topSignal} digest={digest} />

      {totalCompanies === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          hint={t("emptyBody")}
          action={
            <Link href="/companies" className={cn(buttonVariants())}>
              {t("emptyAction")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
            <Kpi
              label={t("statWeek")}
              value={formatMinutes(weekMinutes)}
              footnote={
                weekMinutes > 0
                  ? t("statWeekShare", {
                      share: Math.round((billableMinutes / weekMinutes) * 100),
                    })
                  : undefined
              }
            />
            <Kpi
              label={t("statUnbilled")}
              value={formatOere(unbilledValueOere)}
              tone="accent"
              footnote={
                unbilledCustomers > 0
                  ? t("statUnbilledMeta", { count: unbilledCustomers })
                  : undefined
              }
            />
            <Kpi
              label={t("statOutstanding")}
              value={formatOere(invoicing.outstandingOere)}
              footnote={
                invoicing.overdueOere > 0 ? (
                  <span className="text-destructive font-medium">
                    {t("statOverdue", { amount: formatOere(invoicing.overdueOere) })}
                  </span>
                ) : undefined
              }
            />
            <Kpi
              label={t("statPipeline")}
              value={String(activePipeline)}
              footnote={t("statPipelineMeta", { count: totalCompanies })}
            />
          </div>

          <div className="grid gap-4 @3xl:grid-cols-[1.15fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  {t("weekTitle")}
                  <Link
                    href="/time"
                    className="text-primary text-[0.8125rem] font-medium hover:underline"
                  >
                    {t("weekLink")}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WeekChart days={days} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("actionsTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {actionCount === 0 ? (
                  <p className="text-muted-foreground text-[0.8125rem]">{t("actionsEmpty")}</p>
                ) : (
                  <ul className="flex flex-col">
                    {overdue.map((invoice) => (
                      <ActionRow
                        key={invoice.id}
                        tone="overdue"
                        title={t("actionOverdue", {
                          number: invoice.invoiceNumber ?? 0,
                          days: Math.max(
                            1,
                            Math.round(
                              (Date.parse(`${today}T00:00:00Z`) -
                                Date.parse(`${invoice.dueDate}T00:00:00Z`)) /
                                86_400_000,
                            ),
                          ),
                        })}
                        meta={`${invoice.buyerName ?? invoice.companyName ?? "—"} · ${formatOere(invoice.grossOere)}`}
                        action={
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          >
                            {t("actionOpen")}
                          </Link>
                        }
                      />
                    ))}
                    {unbilledValueOere > 0 ? (
                      <ActionRow
                        tone="billable"
                        title={t("actionUnbilled", { amount: formatOere(unbilledValueOere) })}
                        meta={t("actionUnbilledMeta", { count: unbilledCustomers })}
                        action={
                          <Link href="/economy" className={cn(buttonVariants({ size: "sm" }))}>
                            {t("actionInvoice")}
                          </Link>
                        }
                      />
                    ) : null}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                {t("latestTitle")}
                <Link
                  href="/companies"
                  className="text-primary text-[0.8125rem] font-medium hover:underline"
                >
                  {t("viewAll")}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.latest.length === 0 ? (
                <p className="text-muted-foreground text-[0.8125rem]">{t("latestEmpty")}</p>
              ) : (
                <ul className="flex flex-col">
                  {overview.latest.map((entry) => (
                    <li
                      key={entry.id}
                      className="border-hairline flex items-baseline gap-4 border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0 text-[0.845rem]"
                    >
                      <span className="text-label w-24 shrink-0 text-xs">
                        {format.dateTime(entry.happenedAt, { day: "numeric", month: "short" })}
                      </span>
                      <p className="min-w-0 flex-1 truncate">
                        <Link
                          href={`/companies/${entry.companyId}`}
                          className="font-semibold hover:underline"
                        >
                          {entry.companyName}
                        </Link>
                        <span className="text-muted-foreground"> · {headlineFor(entry)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
