import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { INVOICE_STATUSES, type InvoiceStatus } from "@/core/db/schema";
import { formatDateDa } from "@/core/dates";
import { listUnbilledCustomers } from "@/modules/invoicing/economy";
import { formatOere } from "@/modules/invoicing/money";
import { getInvoicingOverview, listInvoices } from "@/modules/invoicing/service";
import { INVOICE_STATUS_BADGE_CLASS } from "@/modules/invoicing/status-meta";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NewInvoiceButton } from "./new-invoice-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoicing.list");
  return { title: t("title") };
}

function isStatus(value: string | undefined): value is InvoiceStatus {
  return Boolean(value) && (INVOICE_STATUSES as readonly string[]).includes(value!);
}

export default async function InvoicesPage({
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
  const today = new Date().toISOString().slice(0, 10);
  const [t, tStatus, invoices, overview, unbilledCustomers] = await Promise.all([
    getTranslations("invoicing.list"),
    getTranslations("invoicing.status"),
    listInvoices(context, filter),
    getInvoicingOverview(context),
    listUnbilledCustomers(context),
  ]);

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={
          overview.overdueOere > 0
            ? t("summaryOverdue", {
                outstanding: formatOere(overview.outstandingOere),
                overdue: formatOere(overview.overdueOere),
              })
            : t("summary", { outstanding: formatOere(overview.outstandingOere) })
        }
        actions={<NewInvoiceButton customers={unbilledCustomers} />}
      />

      <SegmentedFilter
        className="self-start"
        items={[
          { key: "all", label: t("filterAll"), href: "/invoices", active: !filter },
          ...INVOICE_STATUSES.map((s) => ({
            key: s,
            label: tStatus(s),
            href: { pathname: "/invoices" as const, query: { status: s } },
            active: filter === s,
          })),
        ]}
      />

      {invoices.length === 0 ? (
        <EmptyState
          title={filter ? t("noResults") : t("empty")}
          hint={filter ? undefined : t("emptyHint")}
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("number")}</TableHead>
                <TableHead>{t("customer")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("due")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>{t("statusHead")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const overdue =
                  invoice.type === "invoice" &&
                  invoice.status === "sent" &&
                  Boolean(invoice.dueDate) &&
                  invoice.dueDate! < today;
                return (
                  <TableRow key={invoice.id} className="relative">
                    <TableCell className="text-[0.845rem] font-semibold">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {invoice.invoiceNumber ?? t("draftLabel")}
                        {invoice.type === "credit_note" ? (
                          <span className="text-meta ml-1.5 text-xs font-normal">
                            {t("creditNote")}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[0.8125rem]">
                      {invoice.buyerName ?? invoice.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="text-meta text-[0.8125rem]">
                      {invoice.invoiceDate ? formatDateDa(invoice.invoiceDate) : ""}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-[0.8125rem]",
                        overdue ? "text-destructive font-medium" : "text-meta",
                      )}
                    >
                      {invoice.type === "invoice" && invoice.dueDate
                        ? formatDateDa(invoice.dueDate)
                        : ""}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-[0.8125rem] tabular-nums",
                        invoice.type === "credit_note" && "text-destructive",
                      )}
                    >
                      {formatOere(invoice.grossOere)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={INVOICE_STATUS_BADGE_CLASS[invoice.status as InvoiceStatus]}
                      >
                        {tStatus(invoice.status)}
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
