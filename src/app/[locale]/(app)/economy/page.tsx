import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/core/auth/session";
import { todayInCopenhagen } from "@/core/dates";
import { formatMinutes } from "@/modules/time/duration";
import { getCustomerEconomy, getYearOverview } from "@/modules/invoicing/economy";
import { formatOere } from "@/modules/invoicing/money";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { FrameIndicator } from "./frame-indicator";
import { TargetCell } from "./target-cell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("economy");
  return { title: t("title") };
}

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export default async function EconomyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const currentYear = Number(todayInCopenhagen().slice(0, 4));
  const { year: yearParam } = await searchParams;
  const parsed = Number(yearParam);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : currentYear;

  const [t, months, customers] = await Promise.all([
    getTranslations("economy"),
    getYearOverview(context, year),
    getCustomerEconomy(context),
  ]);

  const realizedYear = months.reduce((sum, m) => sum + m.realizedOere, 0);
  const targetYear = months.reduce((sum, m) => sum + (m.targetOere ?? 0), 0);
  const currentMonth = Number(todayInCopenhagen().slice(5, 7));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-1">
          <Link
            href={{ pathname: "/economy", query: { year: year - 1 } }}
            aria-label={t("prevYear")}
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
          >
            <ChevronLeft />
          </Link>
          <span className="min-w-16 text-center font-medium tabular-nums">{year}</span>
          <Link
            href={{ pathname: "/economy", query: { year: year + 1 } }}
            aria-label={t("nextYear")}
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
          >
            <ChevronRight />
          </Link>
        </div>
      </div>

      <Card className="py-0 shadow-none">
        <CardHeader className="pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>{t("monthsTitle")}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {t("yearSummary", {
                realized: formatOere(realizedYear),
                target: formatOere(targetYear),
              })}
            </p>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("month")}</TableHead>
                <TableHead className="text-right">{t("target")}</TableHead>
                <TableHead className="text-right">{t("realized")}</TableHead>
                <TableHead className="text-right">{t("gap")}</TableHead>
                <TableHead className="text-right">{t("outstanding")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((row) => {
                const isCurrent = year === currentYear && row.month === currentMonth;
                const gap = row.targetOere != null ? row.realizedOere - row.targetOere : null;
                return (
                  <TableRow key={row.month} className={isCurrent ? "bg-muted/40" : undefined}>
                    <TableCell className={isCurrent ? "font-medium" : undefined}>
                      {t(`months.${MONTH_KEYS[row.month - 1]!}`)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <TargetCell year={year} month={row.month} targetOere={row.targetOere} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.realizedOere !== 0 || row.targetOere != null
                        ? formatOere(row.realizedOere)
                        : ""}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        gap != null && gap < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {gap != null ? formatOere(gap) : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {row.outstandingOere !== 0 ? formatOere(row.outstandingOere) : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="py-0 shadow-none">
        <CardHeader className="pt-6">
          <CardTitle>{t("customersTitle")}</CardTitle>
        </CardHeader>
        {customers.length === 0 ? (
          <CardContent className="text-muted-foreground pb-6 text-sm">{t("noCustomers")}</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customer")}</TableHead>
                  <TableHead className="text-right">{t("tracked")}</TableHead>
                  <TableHead className="text-right">{t("unbilled")}</TableHead>
                  <TableHead className="text-right">{t("invoiced")}</TableHead>
                  <TableHead className="text-right">{t("outstanding")}</TableHead>
                  <TableHead className="text-right">{t("paid")}</TableHead>
                  <TableHead>{t("frame")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((row) => (
                  <TableRow key={row.companyId} className="relative">
                    <TableCell className="font-medium">
                      <Link
                        href={`/companies/${row.companyId}`}
                        className="after:absolute after:inset-0"
                      >
                        {row.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.trackedMinutes > 0 ? formatMinutes(row.trackedMinutes) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.unbilledMinutes > 0 ? formatMinutes(row.unbilledMinutes) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.invoicedNetOere !== 0 ? formatOere(row.invoicedNetOere) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.outstandingGrossOere !== 0 ? formatOere(row.outstandingGrossOere) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.paidGrossOere !== 0 ? formatOere(row.paidGrossOere) : ""}
                    </TableCell>
                    <TableCell className="min-w-44">
                      <FrameIndicator
                        budgetMinutes={row.budgetMinutes}
                        budgetAmountOere={row.budgetAmountOere}
                        trackedMinutes={row.trackedMinutes}
                        invoicedNetOere={row.invoicedNetOere}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
