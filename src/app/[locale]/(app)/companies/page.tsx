import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/core/auth/session";
import { listCompanies } from "@/modules/crm/service";
import { STAGE_BADGE_CLASS } from "@/modules/crm/stage-meta";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CreateCompanyDialog } from "./create-company-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crm.list");
  return { title: t("title") };
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { q } = await searchParams;
  const query = q?.trim() || undefined;
  const [t, tStages, companies] = await Promise.all([
    getTranslations("crm.list"),
    getTranslations("crm.stages"),
    listCompanies(context, query),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <CreateCompanyDialog />
      </div>

      <form method="get" className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="pl-9"
        />
      </form>

      {companies.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="font-medium">{query ? t("noResults") : t("empty")}</p>
              {!query ? (
                <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                  {t("emptyHint")}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("cvr")}</TableHead>
                <TableHead>{t("city")}</TableHead>
                <TableHead>{t("stage")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="p-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className="block px-3 py-2.5 font-medium hover:underline"
                    >
                      {company.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {company.cvr ?? "–"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{company.city ?? "–"}</TableCell>
                  <TableCell>
                    <Badge className={cn(STAGE_BADGE_CLASS[company.pipelineStage as never])}>
                      {tStages(company.pipelineStage as never)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
