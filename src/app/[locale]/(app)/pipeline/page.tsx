import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={
          companies.length > 0 ? t("summary", { open, total: companies.length }) : undefined
        }
      />

      {companies.length === 0 ? (
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <PipelineBoard companies={companies} />
      )}
    </div>
  );
}
