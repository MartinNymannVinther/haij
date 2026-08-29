"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setNextInvoiceNumberAction } from "@/modules/invoicing/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * The number the next issued invoice will carry. Editable so a business
 * moving in from another system keeps its sequence, but only upwards —
 * the server and a database trigger both refuse a step backwards.
 */
export function NumberingCard({ nextNumber }: { nextNumber: number }) {
  const t = useTranslations("orgProfile.numbering");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = Number(String(form.get("next") ?? "").trim());
    if (!Number.isInteger(next) || next < 1) {
      toast.error(t("tooLow"));
      return;
    }
    setPending(true);
    const result = await setNextInvoiceNumberAction(next);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error === "numberTooLow" ? t("tooLow") : tCommon("error"));
      return;
    }
    toast.success(t("savedToast", { number: next }));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="next-invoice-number" className="text-label text-xs font-medium">
              {t("label")}
            </label>
            <Input
              id="next-invoice-number"
              name="next"
              inputMode="numeric"
              min={nextNumber}
              defaultValue={String(nextNumber)}
              className="w-40 tabular-nums"
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
