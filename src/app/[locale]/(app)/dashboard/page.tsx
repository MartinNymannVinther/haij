import { eq } from "drizzle-orm";
import { ArrowRight, Banknote, Building2, Clock, KanbanSquare, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgContext } from "@/core/auth/session";
import { organizations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { getCrmOverview } from "@/modules/crm/service";
import { formatOere } from "@/modules/invoicing/money";
import { getInvoicingOverview } from "@/modules/invoicing/service";
import { formatMinutes, isoWeekMonday } from "@/modules/time/duration";
import { weekTotalMinutes } from "@/modules/time/service";
import { Link, redirect } from "@/i18n/navigation";
import { PasskeyPrompt } from "./passkey-prompt";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dashboard");
  return { title: t("title") };
}

function StatCard({
  icon,
  tint,
  label,
  value,
  footer,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">{label}</p>
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tint}`}>
            {icon}
          </span>
        </div>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {footer}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const t = await getTranslations("app.dashboard");
  const tTimeline = await getTranslations("crm.timeline");
  const tStages = await getTranslations("crm.stages");
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

  const monday = isoWeekMonday(new Date());
  const [overview, weekMinutes, invoicing, format] = await Promise.all([
    getCrmOverview(context),
    weekTotalMinutes(context, monday),
    getInvoicingOverview(context),
    getFormatter(),
  ]);
  const totalCompanies = overview.stages.reduce((sum, row) => sum + row.count, 0);
  const activePipeline = overview.stages
    .filter((row) => ["lead", "dialogue", "proposal"].includes(row.stage))
    .reduce((sum, row) => sum + row.count, 0);

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{organization.name}</p>
      </div>
      <PasskeyPrompt />

      {totalCompanies === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title={t("emptyTitle")}
          hint={t("emptyBody")}
          action={
            <Link
              href="/companies"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {t("viewAll")}
              <ArrowRight className="size-3.5" />
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
            <StatCard
              icon={<Building2 className="size-4" />}
              tint="bg-secondary text-secondary-foreground"
              label={t("statCompanies")}
              value={String(totalCompanies)}
            />
            <StatCard
              icon={<KanbanSquare className="size-4" />}
              tint="bg-warning-tint text-warning"
              label={t("statPipeline")}
              value={String(activePipeline)}
            />
            <StatCard
              icon={<Clock className="size-4" />}
              tint="bg-accent text-accent-foreground"
              label={t("statWeek")}
              value={formatMinutes(weekMinutes)}
            />
            <StatCard
              icon={<Banknote className="size-4" />}
              tint="bg-accent text-accent-foreground"
              label={t("statOutstanding")}
              value={formatOere(invoicing.outstandingOere)}
              footer={
                invoicing.overdueOere > 0 ? (
                  <p className="text-destructive mt-1 text-xs font-medium">
                    {t("statOverdue", { amount: formatOere(invoicing.overdueOere) })}
                  </p>
                ) : null
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {t("latestTitle")}
                <Link
                  href="/companies"
                  className="text-primary text-sm font-medium hover:underline"
                >
                  {t("viewAll")}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.latest.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("latestEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {overview.latest.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <p className="min-w-0 truncate">
                        <Link
                          href={`/companies/${entry.companyId}`}
                          className="font-medium hover:underline"
                        >
                          {entry.companyName}
                        </Link>
                        <span className="text-muted-foreground"> · {headlineFor(entry)}</span>
                      </p>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {format.dateTime(entry.happenedAt, { day: "numeric", month: "short" })}
                      </span>
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
