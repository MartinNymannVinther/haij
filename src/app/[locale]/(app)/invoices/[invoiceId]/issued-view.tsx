"use client";

import { ArrowLeft, Banknote, FileDown, FileMinus2, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { invoiceLines, invoices, InvoiceStatus } from "@/core/db/schema";
import { formatDateDa } from "@/core/dates";
import {
  createCreditNoteAction,
  markPaidAction,
  markSentAction,
} from "@/modules/invoicing/actions";
import { formatOere, formatQuantityHundredths } from "@/modules/invoicing/money";
import { INVOICE_STATUS_BADGE_CLASS } from "@/modules/invoicing/status-meta";
import { Link, useRouter } from "@/i18n/navigation";

type Invoice = typeof invoices.$inferSelect;
type Line = typeof invoiceLines.$inferSelect;

export function IssuedView({ invoice, lines }: { invoice: Invoice; lines: Line[] }) {
  const t = useTranslations("invoicing.detail");
  const tStatus = useTranslations("invoicing.status");
  const tUnits = useTranslations("invoicing.units");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState<"sent" | "paid" | "credit" | null>(null);

  const isCredit = invoice.type === "credit_note";
  const pdfHref = `/api/invoices/${invoice.id}/pdf`;

  async function handleMarkSent() {
    setPending("sent");
    const result = await markSentAction(invoice.id);
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("sentToast"));
    router.refresh();
  }

  async function handleMarkPaid() {
    setPending("paid");
    const result = await markPaidAction(invoice.id);
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("paidToast"));
    router.refresh();
  }

  async function handleCreditNote() {
    setPending("credit");
    const result = await createCreditNoteAction(invoice.id);
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("creditToast"));
    router.push(`/invoices/${result.data.invoiceId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/invoices"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isCredit
              ? t("creditHeading", { number: invoice.invoiceNumber ?? 0 })
              : t("heading", { number: invoice.invoiceNumber ?? 0 })}
          </h1>
          <Badge className={INVOICE_STATUS_BADGE_CLASS[invoice.status as InvoiceStatus]}>
            {tStatus(invoice.status)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={pdfHref} target="_blank" rel="noreferrer">
            <Button variant="outline">
              <FileDown data-slot="icon" />
              {t("pdf")}
            </Button>
          </a>
          {invoice.status === "issued" ? (
            <Button variant="outline" onClick={handleMarkSent} disabled={pending !== null}>
              {pending === "sent" ? (
                <Loader2 data-slot="icon" className="animate-spin" />
              ) : (
                <Send data-slot="icon" />
              )}
              {t("markSent")}
            </Button>
          ) : null}
          {invoice.status === "issued" || invoice.status === "sent" ? (
            <Button onClick={handleMarkPaid} disabled={pending !== null}>
              {pending === "paid" ? (
                <Loader2 data-slot="icon" className="animate-spin" />
              ) : (
                <Banknote data-slot="icon" />
              )}
              {t("markPaid")}
            </Button>
          ) : null}
          {!isCredit ? (
            <Button variant="outline" onClick={handleCreditNote} disabled={pending !== null}>
              {pending === "credit" ? (
                <Loader2 data-slot="icon" className="animate-spin" />
              ) : (
                <FileMinus2 data-slot="icon" />
              )}
              {t("createCredit")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("linesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("lineDescription")}</TableHead>
                    <TableHead className="text-right">{t("lineQuantity")}</TableHead>
                    <TableHead>{t("lineUnit")}</TableHead>
                    <TableHead className="text-right">{t("linePrice")}</TableHead>
                    <TableHead className="text-right">{t("lineAmount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="max-w-72 truncate">{line.description}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantityHundredths(line.quantityHundredths)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{tUnits(line.unit)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatOere(line.unitPriceOere)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatOere(line.lineNetOere)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="ml-auto flex w-full max-w-64 flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("subtotal")}</span>
                <span className="tabular-nums">{formatOere(invoice.netOere)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("vatTotal")}</span>
                <span className="tabular-nums">{formatOere(invoice.vatOere)}</span>
              </div>
              <div className="border-border flex justify-between border-t pt-1 font-medium">
                <span>{t("grandTotal")}</span>
                <span className="tabular-nums">{formatOere(invoice.grossOere)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("partiesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs tracking-wide uppercase">
                  {t("buyer")}
                </p>
                <p className="mt-1 font-medium">{invoice.buyerName}</p>
                {invoice.buyerAddress ? <p>{invoice.buyerAddress}</p> : null}
                <p>{[invoice.buyerZipcode, invoice.buyerCity].filter(Boolean).join(" ")}</p>
                {invoice.buyerCvr ? (
                  <p className="text-muted-foreground">CVR {invoice.buyerCvr}</p>
                ) : null}
              </div>
              <Separator />
              <div>
                <p className="text-muted-foreground text-xs tracking-wide uppercase">
                  {t("seller")}
                </p>
                <p className="mt-1 font-medium">{invoice.sellerName}</p>
                <p>{invoice.sellerAddress}</p>
                <p>{[invoice.sellerZipcode, invoice.sellerCity].filter(Boolean).join(" ")}</p>
                <p className="text-muted-foreground">CVR {invoice.sellerCvr}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("datesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("invoiceDate")}</span>
                <span>{invoice.invoiceDate ? formatDateDa(invoice.invoiceDate) : ""}</span>
              </div>
              {invoice.deliveryDate ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("deliveryDate")}</span>
                  <span>{formatDateDa(invoice.deliveryDate)}</span>
                </div>
              ) : null}
              {!isCredit && invoice.dueDate ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("dueDate")}</span>
                  <span>{formatDateDa(invoice.dueDate)}</span>
                </div>
              ) : null}
              {invoice.sentAt ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("sentAt")}</span>
                  <span>{formatDateDa(invoice.sentAt.toISOString().slice(0, 10))}</span>
                </div>
              ) : null}
              {invoice.paidAt ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("paidAt")}</span>
                  <span>{formatDateDa(invoice.paidAt.toISOString().slice(0, 10))}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {invoice.note ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("noteTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{invoice.note}</CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
