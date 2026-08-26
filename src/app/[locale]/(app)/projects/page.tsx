import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/core/auth/session";
import { PROJECT_STATUSES, type ProjectStatus } from "@/core/db/schema";
import { formatDateDa } from "@/core/dates";
import { listCompanies } from "@/modules/crm/service";
import { listProjects } from "@/modules/projects/service";
import { PROJECT_STATUS_BADGE_CLASS } from "@/modules/projects/status-meta";
import { formatMinutes } from "@/modules/time/duration";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { FrameIndicator } from "../economy/frame-indicator";
import { CreateProjectDialog } from "./create-project-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects.list");
  return { title: t("title") };
}

function isStatus(value: string | undefined): value is ProjectStatus {
  return Boolean(value) && (PROJECT_STATUSES as readonly string[]).includes(value!);
}

export default async function ProjectsPage({
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
  const filter = isStatus(status) ? status : undefined;
  const [t, tStatus, projects, companies] = await Promise.all([
    getTranslations("projects.list"),
    getTranslations("projects.status"),
    listProjects(context, filter),
    listCompanies(context),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <CreateProjectDialog companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/projects"
          className={cn(
            "rounded-md border px-2.5 py-1 text-sm transition-colors",
            !filter
              ? "border-transparent bg-secondary font-medium"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {t("filterAll")}
        </Link>
        {PROJECT_STATUSES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/projects", query: { status: s } }}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm transition-colors",
              filter === s
                ? "border-transparent bg-secondary font-medium"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {tStatus(s)}
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <FolderKanban className="size-5" />
            </div>
            <div>
              <p className="font-medium">{filter ? t("noResults") : t("empty")}</p>
              {!filter ? (
                <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                  {t("emptyHint")}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 shadow-none">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("customer")}</TableHead>
                  <TableHead>{t("tasks")}</TableHead>
                  <TableHead className="text-right">{t("tracked")}</TableHead>
                  <TableHead>{t("deadline")}</TableHead>
                  <TableHead>{t("frame")}</TableHead>
                  <TableHead>{t("statusHead")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id} className="relative">
                    <TableCell className="font-medium">
                      <Link
                        href={`/projects/${project.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.companyName ?? ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {project.openTasks + project.doneTasks > 0
                        ? t("taskCount", {
                            done: project.doneTasks,
                            total: project.openTasks + project.doneTasks,
                          })
                        : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {project.trackedMinutes > 0 ? formatMinutes(project.trackedMinutes) : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {project.deadline ? formatDateDa(project.deadline) : ""}
                    </TableCell>
                    <TableCell className="min-w-44">
                      <FrameIndicator
                        budgetMinutes={project.budgetMinutes}
                        budgetAmountOere={project.budgetAmountOere}
                        trackedMinutes={project.trackedMinutes}
                        invoicedNetOere={project.trackedValueOere}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge className={PROJECT_STATUS_BADGE_CLASS[project.status]}>
                        {tStatus(project.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
