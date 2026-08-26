import { KanbanSquare } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { getOrgContext } from "@/core/auth/session";
import type { PipelineStage } from "@/core/db/schema";
import { listCompaniesForPipeline } from "@/modules/crm/service";
import { STAGE_ORDER } from "@/modules/crm/stage-meta";
import { Link, redirect } from "@/i18n/navigation";
import { StageSelect } from "../companies/[companyId]/stage-select";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crm.pipeline");
  return { title: t("title") };
}

export default async function PipelinePage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const [t, tStages, companies] = await Promise.all([
    getTranslations("crm.pipeline"),
    getTranslations("crm.stages"),
    listCompaniesForPipeline(context),
  ]);

  const columns = STAGE_ORDER.map((stage) => ({
    stage,
    items: companies.filter((company) => company.pipelineStage === stage),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {companies.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <KanbanSquare className="size-5" />
            </div>
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-4">
            {columns.map((column) => (
              <section key={column.stage} className="w-64 shrink-0">
                <h2 className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-medium tracking-wide uppercase">
                  {tStages(column.stage)}
                  <span className="tabular-nums">{column.items.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {column.items.map((company) => (
                    <div key={company.id} className="bg-card rounded-lg border p-3">
                      <Link
                        href={`/companies/${company.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {company.name}
                      </Link>
                      {company.city ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">{company.city}</p>
                      ) : null}
                      <div className="mt-2">
                        <StageSelect
                          companyId={company.id}
                          stage={company.pipelineStage as PipelineStage}
                          companyName={company.name}
                          size="sm"
                        />
                      </div>
                    </div>
                  ))}
                  {column.items.length === 0 ? (
                    <div className="border-border/60 text-muted-foreground/50 rounded-lg border border-dashed p-3 text-center text-xs">
                      –
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
