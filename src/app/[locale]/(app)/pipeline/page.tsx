import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgContext } from "@/core/auth/session";
import { listCompaniesForPipeline } from "@/modules/crm/service";
import { redirect } from "@/i18n/navigation";
import { PipelineBoard } from "./pipeline-board";

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
  const [t, companies] = await Promise.all([
    getTranslations("crm.pipeline"),
    listCompaniesForPipeline(context),
  ]);

  const open = companies.filter((company) =>
    ["lead", "dialogue", "proposal"].includes(company.pipelineStage),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {companies.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("summary", { open, total: companies.length })}
          </p>
        ) : null}
      </div>

      {companies.length === 0 ? (
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <PipelineBoard companies={companies} />
      )}
    </div>
  );
}
