import { ArrowLeft, Clock } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOrgContext } from "@/core/auth/session";
import { formatDateDa } from "@/core/dates";
import { listCompanies } from "@/modules/crm/service";
import { formatOere } from "@/modules/invoicing/money";
import { getProjectDetail } from "@/modules/projects/service";
import { formatMinutes } from "@/modules/time/duration";
import { Link, redirect } from "@/i18n/navigation";
import { FrameIndicator } from "../../economy/frame-indicator";
import { ProjectActions } from "./project-actions";
import { TaskList } from "./task-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects.detail");
  return { title: t("title") };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { projectId } = await params;
  const detail = await getProjectDetail(context, projectId);
  if (!detail) notFound();

  const [t, companies] = await Promise.all([
    getTranslations("projects.detail"),
    listCompanies(context),
  ]);
  const { project, company, tasks, recentTime, trackedMinutes, unbilledMinutes, trackedValueOere } =
    detail;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" />
          {t("back")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground text-sm">
              {[
                company ? company.name : null,
                project.deadline ? t("deadlineLine", { date: formatDateDa(project.deadline) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ProjectActions
            project={{
              id: project.id,
              name: project.name,
              status: project.status,
              companyId: project.companyId,
              description: project.description,
              deadline: project.deadline,
              budgetMinutes: project.budgetMinutes,
              budgetAmountOere: project.budgetAmountOere,
              hourlyRateOere: project.hourlyRateOere,
            }}
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          />
        </div>
      </div>

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <TaskList projectId={project.id} tasks={tasks} />

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("timeTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTime.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("noTime")}</p>
              ) : (
                <ol className="flex flex-col">
                  {recentTime.map((entry) => (
                    <li
                      key={entry.id}
                      className="border-border flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-b-0"
                    >
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {formatDateDa(entry.entryDate)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {entry.note ?? t("noNote")}
                        {entry.invoiceLineId ? (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {t("billed")}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMinutes(entry.durationMinutes)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("consumptionTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {t("tracked")}
                </span>
                <span className="tabular-nums">{formatMinutes(trackedMinutes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("unbilled")}</span>
                <span className="tabular-nums">{formatMinutes(unbilledMinutes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("value")}</span>
                <span className="tabular-nums">{formatOere(trackedValueOere)}</span>
              </div>
              {project.budgetMinutes || project.budgetAmountOere ? (
                <>
                  <Separator />
                  <FrameIndicator
                    budgetMinutes={project.budgetMinutes}
                    budgetAmountOere={project.budgetAmountOere}
                    trackedMinutes={trackedMinutes}
                    invoicedNetOere={trackedValueOere}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>

          {project.description ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("descriptionTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">
                {project.description}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
