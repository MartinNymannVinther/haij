"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction } from "@/modules/projects/actions";
import { parseKronerToOere, parseQuantityToHundredths } from "@/modules/invoicing/money";
import { useRouter } from "@/i18n/navigation";

export function CreateProjectDialog({
  companies,
  defaultCompanyId,
}: {
  companies: Array<{ id: string; name: string }>;
  defaultCompanyId?: string;
}) {
  const t = useTranslations("projects.create");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [companyId, setCompanyId] = useState<string>(defaultCompanyId ?? "");

  const companyItems = [
    { value: "", label: t("noCompany") },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const hoursRaw = String(form.get("budgetHours") ?? "").trim();
    const amountRaw = String(form.get("budgetAmount") ?? "").trim();
    const rateRaw = String(form.get("hourlyRate") ?? "").trim();
    const hoursHundredths = hoursRaw ? parseQuantityToHundredths(hoursRaw) : null;
    const amountOere = amountRaw ? parseKronerToOere(amountRaw) : null;
    const rateOere = rateRaw ? parseKronerToOere(rateRaw) : null;
    if (
      (hoursRaw && (hoursHundredths === null || hoursHundredths <= 0)) ||
      (amountRaw && (amountOere === null || amountOere <= 0)) ||
      (rateRaw && (rateOere === null || rateOere < 0))
    ) {
      toast.error(t("invalidFrames"));
      return;
    }

    setPending(true);
    const result = await createProjectAction({
      name: String(form.get("name") ?? ""),
      companyId: companyId || null,
      description: String(form.get("description") ?? ""),
      deadline: String(form.get("deadline") ?? "") || null,
      budgetMinutes: hoursHundredths != null ? Math.round((hoursHundredths * 60) / 100) : null,
      budgetAmountOere: amountOere,
      hourlyRateOere: rateOere,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("createdToast"));
    setOpen(false);
    router.push(`/projects/${result.data.projectId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus data-slot="icon" />
        {t("title")}
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="project-name">{t("name")}</FieldLabel>
            <Input id="project-name" name="name" required maxLength={200} autoFocus />
          </Field>
          <Field>
            <FieldLabel>{t("customer")}</FieldLabel>
            <Select
              items={companyItems}
              value={companyId}
              onValueChange={(v) => setCompanyId((v as string) ?? "")}
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
          <Field>
            <FieldLabel htmlFor="project-description">{t("description")}</FieldLabel>
            <Textarea id="project-description" name="description" rows={2} maxLength={2000} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="project-deadline">{t("deadline")}</FieldLabel>
              <Input id="project-deadline" name="deadline" type="date" />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-hourlyRate">{t("hourlyRate")}</FieldLabel>
              <Input
                id="project-hourlyRate"
                name="hourlyRate"
                inputMode="decimal"
                placeholder={t("rateFallback")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-budgetHours">{t("hourFrame")}</FieldLabel>
              <Input
                id="project-budgetHours"
                name="budgetHours"
                inputMode="decimal"
                placeholder={t("none")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-budgetAmount">{t("amountFrame")}</FieldLabel>
              <Input
                id="project-budgetAmount"
                name="budgetAmount"
                inputMode="decimal"
                placeholder={t("none")}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
