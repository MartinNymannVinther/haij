import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedFilter } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/core/auth/session";
import { PIPELINE_STAGES, type PipelineStage } from "@/core/db/schema";
import { listCompanies } from "@/modules/crm/service";
import { STAGE_BADGE_CLASS, STAGE_ORDER } from "@/modules/crm/stage-meta";
import { getUnbilledByCompany } from "@/modules/invoicing/economy";
import { formatOere } from "@/modules/invoicing/money";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CreateCompanyDialog } from "./create-company-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crm.list");
  return { title: t("title") };
}

function isStage(value: string | undefined): value is PipelineStage {
  return Boolean(value) && (PIPELINE_STAGES as readonly string[]).includes(value!);
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { q, stage } = await searchParams;
  const query = q?.trim() || undefined;
  const filter = isStage(stage) ? stage : undefined;

  const [t, tStages, companies, unbilled] = await Promise.all([
    getTranslations("crm.list"),
    getTranslations("crm.stages"),
    listCompanies(context, query, filter),
    getUnbilledByCompany(context),
  ]);

  const activeCount = companies.filter((company) =>
    ["lead", "dialogue", "proposal"].includes(company.pipelineStage),
  ).length;

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={t("summary", { count: companies.length, active: activeCount })}
        actions={<CreateCompanyDialog />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="relative min-w-[16rem] flex-1">
          {filter ? <input type="hidden" name="stage" value={filter} /> : null}
          <Search className="text-label absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="pl-9"
          />
        </form>
        <SegmentedFilter
          items={[
            {
              key: "all",
              label: t("filterAll"),
              href: { pathname: "/companies", query: query ? { q: query } : {} },
              active: !filter,
            },
            ...STAGE_ORDER.filter((s) => s !== "lost").map((s) => ({
              key: s,
              label: tStages(s),
              href: {
                pathname: "/companies" as const,
                query: { ...(query ? { q: query } : {}), stage: s },
              },
              active: filter === s,
            })),
          ]}
        />
      </div>

      {companies.length === 0 ? (
        <EmptyState
          title={query || filter ? t("noResults") : t("empty")}
          hint={query || filter ? undefined : t("emptyHint")}
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("cvr")}</TableHead>
                <TableHead>{t("city")}</TableHead>
                <TableHead className="text-right">{t("unbilled")}</TableHead>
                <TableHead>{t("stage")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => {
                const open = unbilled.get(company.id);
                return (
                  <TableRow key={company.id} className="relative">
                    <TableCell className="text-[0.845rem] font-semibold">
                      <Link
                        href={`/companies/${company.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {company.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-meta text-[0.8125rem]">
                      {company.cvr ?? "—"}
                    </TableCell>
                    <TableCell className="text-meta text-[0.8125rem]">
                      {company.city ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-[0.8125rem]",
                        open?.valueOere ? "text-accent-foreground font-medium" : "text-label",
                      )}
                    >
                      {open?.valueOere ? formatOere(open.valueOere) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={STAGE_BADGE_CLASS[company.pipelineStage as PipelineStage]}>
                        {tStages(company.pipelineStage as never)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
