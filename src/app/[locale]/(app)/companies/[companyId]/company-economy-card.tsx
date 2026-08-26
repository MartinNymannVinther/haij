"use client";

import { FilePlus2, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  createDraftFromTimeAction,
  setCustomerFrameAction,
} from "@/modules/invoicing/actions";
import {
  formatOere,
  oereToInputValue,
  parseKronerToOere,
  parseQuantityToHundredths,
} from "@/modules/invoicing/money";
import { formatMinutes } from "@/modules/time/duration";
import { FrameIndicator } from "../../economy/frame-indicator";
import { useRouter } from "@/i18n/navigation";

export type CompanyEconomy = {
  hourlyRateOere: number | null;
  budgetMinutes: number | null;
  budgetAmountOere: number | null;
  trackedMinutes: number;
  unbilledMinutes: number;
  invoicedNetOere: number;
  paidGrossOere: number;
  outstandingGrossOere: number;
};

export function CompanyEconomyCard({
  companyId,
  economy,
}: {
  companyId: string;
  economy: CompanyEconomy;
}) {
  const t = useTranslations("economy.customerCard");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const rateRaw = String(form.get("hourlyRate") ?? "").trim();
    const hoursRaw = String(form.get("budgetHours") ?? "").trim();
    const amountRaw = String(form.get("budgetAmount") ?? "").trim();

    const hourlyRateOere = rateRaw ? parseKronerToOere(rateRaw) : null;
    const budgetHoursHundredths = hoursRaw ? parseQuantityToHundredths(hoursRaw) : null;
    const budgetAmountOere = amountRaw ? parseKronerToOere(amountRaw) : null;
    if (
      (rateRaw && (hourlyRateOere === null || hourlyRateOere < 0)) ||
      (hoursRaw && (budgetHoursHundredths === null || budgetHoursHundredths <= 0)) ||
      (amountRaw && (budgetAmountOere === null || budgetAmountOere <= 0))
    ) {
      toast.error(t("invalid"));
      return;
    }
    const budgetMinutes =
      budgetHoursHundredths != null ? Math.round((budgetHoursHundredths * 60) / 100) : null;

    setSaving(true);
    const result = await setCustomerFrameAction(companyId, {
      hourlyRateOere,
      budgetMinutes,
      budgetAmountOere,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    setEditOpen(false);
    router.refresh();
  }

  async function handleCreateInvoice() {
    setCreating(true);
    const result = await createDraftFromTimeAction(companyId);
    setCreating(false);
    if (!result.ok) {
      toast.error(result.error === "noUnbilledTime" ? t("noUnbilledTime") : tCommon("error"));
      return;
    }
    toast.success(t("draftToast"));
    router.push(`/invoices/${result.data.invoiceId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil data-slot="icon" />
            {t("editFrames")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("rate")}</span>
          <span className="tabular-nums">
            {economy.hourlyRateOere != null ? formatOere(economy.hourlyRateOere) : t("rateDefault")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("unbilled")}</span>
          <span className="tabular-nums">{formatMinutes(economy.unbilledMinutes)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("invoiced")}</span>
          <span className="tabular-nums">{formatOere(economy.invoicedNetOere)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("outstanding")}</span>
          <span className="tabular-nums">{formatOere(economy.outstandingGrossOere)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("paid")}</span>
          <span className="tabular-nums">{formatOere(economy.paidGrossOere)}</span>
        </div>

        {economy.budgetMinutes || economy.budgetAmountOere ? (
          <>
            <Separator />
            <FrameIndicator
              budgetMinutes={economy.budgetMinutes}
              budgetAmountOere={economy.budgetAmountOere}
              trackedMinutes={economy.trackedMinutes}
              invoicedNetOere={economy.invoicedNetOere}
            />
          </>
        ) : null}

        <Button
          className="mt-1"
          onClick={handleCreateInvoice}
          disabled={creating || economy.unbilledMinutes === 0}
        >
          {creating ? (
            <Loader2 data-slot="icon" className="animate-spin" />
          ) : (
            <FilePlus2 data-slot="icon" />
          )}
          {t("createInvoice")}
        </Button>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("framesTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="hourlyRate">{t("rateLabel")}</FieldLabel>
              <Input
                id="hourlyRate"
                name="hourlyRate"
                inputMode="decimal"
                placeholder={t("rateDefault")}
                defaultValue={
                  economy.hourlyRateOere != null ? oereToInputValue(economy.hourlyRateOere) : ""
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="budgetHours">{t("hourFrameLabel")}</FieldLabel>
              <Input
                id="budgetHours"
                name="budgetHours"
                inputMode="decimal"
                placeholder={t("noFramePlaceholder")}
                defaultValue={
                  economy.budgetMinutes != null
                    ? String(Math.round((economy.budgetMinutes / 60) * 100) / 100).replace(".", ",")
                    : ""
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="budgetAmount">{t("amountFrameLabel")}</FieldLabel>
              <Input
                id="budgetAmount"
                name="budgetAmount"
                inputMode="decimal"
                placeholder={t("noFramePlaceholder")}
                defaultValue={
                  economy.budgetAmountOere != null ? oereToInputValue(economy.budgetAmountOere) : ""
                }
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
