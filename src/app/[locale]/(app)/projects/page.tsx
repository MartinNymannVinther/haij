import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedFilter } from "@/components/ui/segmented";
import { LinkedRow } from "@/components/ui/linked-row";
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
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={t("summary", {
          count: projects.length,
          active: projects.filter((project) => project.status === "active").length,
        })}
        actions={
          <CreateProjectDialog companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
        }
      />

      <SegmentedFilter
        className="self-start"
        items={[
          { key: "all", label: t("filterAll"), href: "/projects", active: !filter },
          ...PROJECT_STATUSES.map((s) => ({
            key: s,
            label: tStatus(s),
            href: { pathname: "/projects" as const, query: { status: s } },
            active: filter === s,
          })),
        ]}
      />

      {projects.length === 0 ? (
        <EmptyState
          title={filter ? t("noResults") : t("empty")}
          hint={filter ? undefined : t("emptyHint")}
        />
      ) : (
        <Card className="py-0">
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
                  <LinkedRow key={project.id} href={`/projects/${project.id}`}>
                    <TableCell className="text-[0.845rem] font-semibold">
                      <Link href={`/projects/${project.id}`}>{project.name}</Link>
                    </TableCell>
                    <TableCell className="text-meta text-[0.8125rem]">
                      {project.companyName ?? ""}
                    </TableCell>
                    <TableCell className="text-meta text-[0.8125rem] tabular-nums">
                      {project.openTasks + project.doneTasks > 0
                        ? t("taskCount", {
                            done: project.doneTasks,
                            total: project.openTasks + project.doneTasks,
                          })
                        : ""}
                    </TableCell>
                    <TableCell className="text-right text-[0.8125rem] tabular-nums">
                      {project.trackedMinutes > 0 ? formatMinutes(project.trackedMinutes) : ""}
                    </TableCell>
                    <TableCell className="text-meta text-[0.8125rem] tabular-nums">
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
                  </LinkedRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
