"use client";

import { FileCheck2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftPreview } from "./draft-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { invoiceLines, invoices, InvoiceUnit, VatCategory } from "@/core/db/schema";
import {
  addLineAction,
  deleteDraftAction,
  issueInvoiceAction,
  removeLineAction,
  updateDraftAction,
  updateLineAction,
} from "@/modules/invoicing/actions";
import {
  formatOere,
  formatQuantityHundredths,
  oereToInputValue,
  parseKronerToOere,
  parseQuantityToHundredths,
  vatRateForCategory,
} from "@/modules/invoicing/money";
import { Link, useRouter } from "@/i18n/navigation";

type Invoice = typeof invoices.$inferSelect;
type Line = typeof invoiceLines.$inferSelect;

const UNITS: InvoiceUnit[] = ["hour", "day", "piece", "fixed"];
const VAT: VatCategory[] = ["standard", "zero", "exempt"];

export function DraftEditor({
  invoice,
  lines,
  companies,
  hasProfile,
  hasTimeEntries,
}: {
  invoice: Invoice;
  lines: Line[];
  companies: Array<{ id: string; name: string }>;
  hasProfile: boolean;
  /** Grouping only makes sense when the lines came from tracked hours. */
  hasTimeEntries: boolean;
}) {
  const t = useTranslations("invoicing.editor");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [savingMeta, setSavingMeta] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(invoice.companyId);

  const companyItems = [
    { value: "", label: t("noCompany") },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  async function saveMeta(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingMeta(true);
    const result = await updateDraftAction(invoice.id, {
      companyId: companyId || null,
      note: String(form.get("note") ?? ""),
      paymentTermsDays: Number(form.get("paymentTermsDays") ?? invoice.paymentTermsDays),
      deliveryDate: String(form.get("deliveryDate") ?? "") || null,
      buyerReference: String(form.get("buyerReference") ?? ""),
      buyerEanGln: String(form.get("buyerEanGln") ?? ""),
    });
    setSavingMeta(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    router.refresh();
  }

  async function handleIssue() {
    setIssuing(true);
    const result = await issueInvoiceAction(invoice.id);
    setIssuing(false);
    setIssueOpen(false);
    if (!result.ok) {
      const key =
        result.error === "noLines"
          ? "issueNoLines"
          : result.error === "noCompany"
            ? "issueNoCompany"
            : result.error === "profileMissing"
              ? "issueNoProfile"
              : null;
      toast.error(key ? t(key) : tCommon("error"));
      return;
    }
    toast.success(t("issuedToast", { number: result.data.invoiceNumber }));
    router.refresh();
  }

  async function handleDelete() {
    setPendingDelete(true);
    const result = await deleteDraftAction(invoice.id);
    setPendingDelete(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("deletedToast"));
    router.push("/invoices");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {invoice.type === "credit_note" ? t("creditTitle") : t("title")}
          </h1>
          <Badge className="border-border bg-transparent text-muted-foreground">
            {t("draftBadge")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 data-slot="icon" />
            {tCommon("delete")}
          </Button>
          <Button onClick={() => setIssueOpen(true)} disabled={issuing}>
            {issuing ? (
              <Loader2 data-slot="icon" className="animate-spin" />
            ) : (
              <FileCheck2 data-slot="icon" />
            )}
            {t("issue")}
          </Button>
        </div>
      </div>

      {!hasProfile ? (
        <Alert>
          <AlertTitle>{t("profileMissingTitle")}</AlertTitle>
          <AlertDescription>
            {t("profileMissingBody")}{" "}
            <Link href="/settings/company" className="font-medium underline underline-offset-4">
              {t("profileMissingLink")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <LinesCard invoiceId={invoice.id} lines={lines} hasTimeEntries={hasTimeEntries} />
        </div>

        {/* Keyed by updatedAt: a save refreshes the invoice props, and
            remounting keeps the uncontrolled defaults in sync (Base UI
            warns if a default changes on a mounted control). */}
        <form key={String(invoice.updatedAt)} onSubmit={saveMeta}>
          <Card>
            <CardHeader>
              <CardTitle>{t("metaTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel>{t("customer")}</FieldLabel>
                  <Select
                    items={companyItems}
                    value={companyId ?? ""}
                    onValueChange={(v) => setCompanyId((v as string) || null)}
                  >
                    <SelectTrigger aria-label={t("customer")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {companyItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="paymentTermsDays">{t("terms")}</FieldLabel>
                    <Input
                      id="paymentTermsDays"
                      name="paymentTermsDays"
                      type="number"
                      min={0}
                      max={120}
                      defaultValue={invoice.paymentTermsDays}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="deliveryDate">{t("deliveryDate")}</FieldLabel>
                    <Input
                      id="deliveryDate"
                      name="deliveryDate"
                      type="date"
                      defaultValue={invoice.deliveryDate ?? ""}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="buyerReference">{t("reference")}</FieldLabel>
                  <Input
                    id="buyerReference"
                    name="buyerReference"
                    maxLength={200}
                    defaultValue={invoice.buyerReference ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="buyerEanGln">{t("ean")}</FieldLabel>
                  <Input
                    id="buyerEanGln"
                    name="buyerEanGln"
                    inputMode="numeric"
                    maxLength={20}
                    defaultValue={invoice.buyerEanGln ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="note">{t("note")}</FieldLabel>
                  <Textarea
                    id="note"
                    name="note"
                    rows={3}
                    maxLength={2000}
                    defaultValue={invoice.note ?? ""}
                  />
                </Field>
                <div>
                  <Button type="submit" variant="outline" disabled={savingMeta}>
                    {savingMeta ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
                    {tCommon("save")}
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </form>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pendingDelete}>
              {pendingDelete ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("issueTitle")}</DialogTitle>
            <DialogDescription>{t("issueBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleIssue} disabled={issuing}>
              {issuing ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("issueConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------- Lines editing --------------------------- */

function LinesCard({
  invoiceId,
  lines,
  hasTimeEntries,
}: {
  invoiceId: string;
  lines: Line[];
  hasTimeEntries: boolean;
}) {
  const t = useTranslations("invoicing.editor");
  const tUnits = useTranslations("invoicing.units");
  const tVat = useTranslations("invoicing.vat");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState<Line | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const netOere = lines.reduce((sum, l) => sum + l.lineNetOere, 0);
  const vatOere = lines.reduce((sum, l) => sum + l.lineVatOere, 0);

  async function handleRemove(lineId: string) {
    const result = await removeLineAction(lineId);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = parseQuantityToHundredths(String(form.get("quantity") ?? ""));
    const price = parseKronerToOere(String(form.get("unitPrice") ?? ""));
    if (quantity === null || quantity === 0 || price === null) {
      toast.error(t("lineInvalid"));
      return;
    }
    const vatCategory = String(form.get("vatCategory") ?? "standard") as VatCategory;
    const input = {
      description: String(form.get("description") ?? ""),
      quantityHundredths: quantity,
      unit: String(form.get("unit") ?? "hour") as InvoiceUnit,
      unitPriceOere: price,
      vatCategory,
      vatRateBp: vatRateForCategory(vatCategory),
    };
    setPending(true);
    const result = editing
      ? await updateLineAction(editing.id, input)
      : await addLineAction(invoiceId, input);
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    setFormOpen(false);
    setEditing(null);
    router.refresh();
  }

  const unitItems = UNITS.map((u) => ({ value: u, label: tUnits(u) }));
  const vatItems = VAT.map((v) => ({ value: v, label: tVat(v) }));

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("linesTitle")}</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus data-slot="icon" />
          {t("addLine")}
        </Button>
      </CardHeader>
      <CardContent className="pb-0">
        <DraftPreview invoiceId={invoiceId} hasTimeEntries={hasTimeEntries} />
      </CardContent>
      <CardContent className="flex flex-col gap-4">
        {lines.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("noLines")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("lineDescription")}</TableHead>
                  <TableHead className="text-right">{t("lineQuantity")}</TableHead>
                  <TableHead>{t("lineUnit")}</TableHead>
                  <TableHead className="text-right">{t("linePrice")}</TableHead>
                  <TableHead className="text-right">{t("lineAmount")}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="max-w-64 truncate">{line.description}</TableCell>
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
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={tCommon("edit")}
                          onClick={() => {
                            setEditing(line);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={tCommon("delete")}
                          onClick={() => handleRemove(line.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="ml-auto flex w-full max-w-64 flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span className="tabular-nums">{formatOere(netOere)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("vatTotal")}</span>
            <span className="tabular-nums">{formatOere(vatOere)}</span>
          </div>
          <div className="border-border flex justify-between border-t pt-1 font-medium">
            <span>{t("grandTotal")}</span>
            <span className="tabular-nums">{formatOere(netOere + vatOere)}</span>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editLineTitle") : t("addLineTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="description">{t("lineDescription")}</FieldLabel>
              <Input
                id="description"
                name="description"
                required
                maxLength={500}
                defaultValue={editing?.description ?? ""}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="quantity">{t("lineQuantity")}</FieldLabel>
                <Input
                  id="quantity"
                  name="quantity"
                  inputMode="decimal"
                  required
                  placeholder="1,5"
                  defaultValue={
                    editing ? formatQuantityHundredths(editing.quantityHundredths) : "1"
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t("lineUnit")}</FieldLabel>
                <UnitSelect
                  items={unitItems}
                  defaultValue={(editing?.unit as InvoiceUnit) ?? "hour"}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="unitPrice">{t("linePriceKr")}</FieldLabel>
                <Input
                  id="unitPrice"
                  name="unitPrice"
                  inputMode="decimal"
                  required
                  placeholder="950,00"
                  defaultValue={editing ? oereToInputValue(editing.unitPriceOere) : ""}
                />
              </Field>
              <Field>
                <FieldLabel>{t("lineVat")}</FieldLabel>
                <VatSelect
                  items={vatItems}
                  defaultValue={(editing?.vatCategory as VatCategory) ?? "standard"}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function UnitSelect({
  items,
  defaultValue,
}: {
  items: Array<{ value: InvoiceUnit; label: string }>;
  defaultValue: InvoiceUnit;
}) {
  const [value, setValue] = useState<InvoiceUnit>(defaultValue);
  return (
    <>
      <input type="hidden" name="unit" value={value} />
      <Select items={items} value={value} onValueChange={(v) => setValue(v as InvoiceUnit)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function VatSelect({
  items,
  defaultValue,
}: {
  items: Array<{ value: VatCategory; label: string }>;
  defaultValue: VatCategory;
}) {
  const [value, setValue] = useState<VatCategory>(defaultValue);
  return (
    <>
      <input type="hidden" name="vatCategory" value={value} />
      <Select items={items} value={value} onValueChange={(v) => setValue(v as VatCategory)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
