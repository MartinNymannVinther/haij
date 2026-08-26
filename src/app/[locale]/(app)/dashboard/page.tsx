import { eq } from "drizzle-orm";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/core/auth/session";
import { organizations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { getCrmOverview } from "@/modules/crm/service";
import { formatMinutes, isoWeekMonday } from "@/modules/time/duration";
import { weekTotalMinutes } from "@/modules/time/service";
import { Link, redirect } from "@/i18n/navigation";
import { PasskeyPrompt } from "./passkey-prompt";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dashboard");
  return { title: t("title") };
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
  const [overview, weekMinutes, format] = await Promise.all([
    getCrmOverview(context),
    weekTotalMinutes(context, monday),
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
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <LayoutDashboard className="size-5" />
            </div>
            <div>
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                {t("emptyBody")}
              </p>
            </div>
            <Link
              href="/companies"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {t("viewAll")}
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-sm">{t("statCompanies")}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {totalCompanies}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-sm">{t("statPipeline")}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {activePipeline}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-sm">{t("statWeek")}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {formatMinutes(weekMinutes)}
                </p>
              </CardContent>
            </Card>
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
