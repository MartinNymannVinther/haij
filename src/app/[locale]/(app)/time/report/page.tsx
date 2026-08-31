import { Fragment } from "react";
import { Download, FileText } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/core/auth/session";
import { formatDateDa } from "@/core/dates";
import { listCompanies } from "@/modules/crm/service";
import { formatOere } from "@/modules/invoicing/money";
import { listRoles } from "@/modules/invoicing/roles";
import { listProjects } from "@/modules/projects/service";
import { formatMinutes } from "@/modules/time/duration";
import {
  getTimeReport,
  REPORT_GROUPINGS,
  REPORT_STATUSES,
  type ReportGrouping,
  type ReportStatus,
} from "@/modules/time/report";
import { redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ReportFilters } from "./report-filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("time.report");
  return { title: t("title") };
}

type Search = {
  from?: string;
  to?: string;
  companyId?: string;
  projectId?: string;
  roleId?: string;
  invoiceId?: string;
  status?: string;
  grouping?: string;
};

function clean(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export default async function TimeReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const search = await searchParams;

  const status = (REPORT_STATUSES as readonly string[]).includes(search.status ?? "")
    ? (search.status as ReportStatus)
    : "all";
  const grouping = (REPORT_GROUPINGS as readonly string[]).includes(search.grouping ?? "")
    ? (search.grouping as ReportGrouping)
    : "none";

  const filters = {
    from: clean(search.from),
    to: clean(search.to),
    companyId: clean(search.companyId),
    projectId: clean(search.projectId),
    roleId: clean(search.roleId),
    invoiceId: clean(search.invoiceId),
    status,
  };

  const [t, report, companies, projects, roles] = await Promise.all([
    getTranslations("time.report"),
    getTimeReport(context, filters, grouping),
    listCompanies(context),
    listProjects(context),
    listRoles(context),
  ]);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, grouping })) {
    if (value) query.set(key, String(value));
  }
  const exportHref = (format: "xlsx" | "pdf") => {
    const params = new URLSearchParams(query);
    params.set("format", format);
    return `/api/time-report?${params.toString()}`;
  };

  const body =
    report.groups.length > 0
      ? report.groups
      : [
          {
            key: "",
            label: "",
            rows: report.rows,
            minutes: report.totalMinutes,
            valueOere: report.totalValueOere,
          },
        ];

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={
          report.rows.length > 0
            ? t("summary", {
                hours: formatMinutes(report.totalMinutes),
                amount: formatOere(report.totalValueOere),
                open: formatMinutes(report.totalMinutes - report.onInvoiceMinutes),
              })
            : undefined
        }
        actions={
          report.rows.length > 0 ? (
            <>
              <a href={exportHref("xlsx")} className={cn(buttonVariants({ variant: "outline" }))}>
                <Download data-slot="icon" />
                {t("exportExcel")}
              </a>
              <a
                href={exportHref("pdf")}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <FileText data-slot="icon" />
                {t("exportPdf")}
              </a>
            </>
          ) : null
        }
      />

      <ReportFilters
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        roles={roles}
      />

      {report.rows.length === 0 ? (
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("dateHead")}</TableHead>
                <TableHead>{t("customerHead")}</TableHead>
                <TableHead>{t("workHead")}</TableHead>
                <TableHead className="text-right">{t("hoursHead")}</TableHead>
                <TableHead className="text-right">{t("amountHead")}</TableHead>
                <TableHead>{t("invoiceHead")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {body.map((group) => (
                <Fragment key={group.key || "all"}>
                  {group.label ? (
                    <TableRow className="bg-background">
                      <TableCell colSpan={3} className="text-[0.8125rem] font-semibold">
                        {group.label}
                      </TableCell>
                      <TableCell className="text-right text-[0.8125rem] font-semibold tabular-nums">
                        {formatMinutes(group.minutes)}
                      </TableCell>
                      <TableCell className="text-right text-[0.8125rem] font-semibold tabular-nums">
                        {formatOere(group.valueOere)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ) : null}
                  {group.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-meta text-[0.8125rem]">
                        {formatDateDa(row.entryDate)}
                      </TableCell>
                      <TableCell className="text-[0.8125rem]">{row.companyName ?? "—"}</TableCell>
                      <TableCell className="text-[0.8125rem]">
                        {[row.projectName, row.taskTitle, row.roleName, row.note]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right text-[0.8125rem] tabular-nums">
                        {formatMinutes(row.durationMinutes)}
                      </TableCell>
                      <TableCell className="text-right text-[0.8125rem] tabular-nums">
                        {formatOere(row.valueOere)}
                      </TableCell>
                      <TableCell className="text-meta text-[0.78rem] tabular-nums">
                        {row.invoiceNumber ?? (row.invoiceStatus === "draft" ? t("onDraft") : "")}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
