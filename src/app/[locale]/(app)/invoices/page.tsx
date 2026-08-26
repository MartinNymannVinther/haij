import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { formatOere } from "@/modules/invoicing/money";
import { listInvoices } from "@/modules/invoicing/service";
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
  const [t, tStatus, invoices] = await Promise.all([
    getTranslations("invoicing.list"),
    getTranslations("invoicing.status"),
    listInvoices(context, filter),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <NewInvoiceButton />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/invoices"
          className={cn(
            "rounded-md border px-2.5 py-1 text-sm transition-colors",
            !filter
              ? "border-transparent bg-accent text-accent-foreground font-medium"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {t("filterAll")}
        </Link>
        {INVOICE_STATUSES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/invoices", query: { status: s } }}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm transition-colors",
              filter === s
                ? "border-transparent bg-accent text-accent-foreground font-medium"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {tStatus(s)}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
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
              {invoices.map((invoice) => (
                <TableRow key={invoice.id} className="relative">
                  <TableCell className="font-medium">
                    <Link href={`/invoices/${invoice.id}`} className="after:absolute after:inset-0">
                      {invoice.invoiceNumber ?? t("draftLabel")}
                      {invoice.type === "credit_note" ? (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          {t("creditNote")}
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.buyerName ?? invoice.companyName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.invoiceDate ? formatDateDa(invoice.invoiceDate) : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.type === "invoice" && invoice.dueDate
                      ? formatDateDa(invoice.dueDate)
                      : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatOere(invoice.grossOere)}
                  </TableCell>
                  <TableCell>
                    <Badge className={INVOICE_STATUS_BADGE_CLASS[invoice.status as InvoiceStatus]}>
                      {tStatus(invoice.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
