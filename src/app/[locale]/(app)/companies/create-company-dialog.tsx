"use client";

import { Download, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createCompanyAction, lookupCvrAction } from "@/modules/crm/actions";
import { useRouter } from "@/i18n/navigation";
import { CompanyFields, EMPTY_COMPANY, type CompanyFormValues } from "./company-fields";

export function CreateCompanyDialog() {
  const t = useTranslations("crm.create");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY);
  const [cvrData, setCvrData] = useState<unknown>(undefined);
  const [industry, setIndustry] = useState<{ code: string | null; text: string | null }>({
    code: null,
    text: null,
  });
  const [companyType, setCompanyType] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<
    { kind: "idle" } | { kind: "pending" } | { kind: "message"; text: string; found?: boolean }
  >({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValues(EMPTY_COMPANY);
    setCvrData(undefined);
    setIndustry({ code: null, text: null });
    setCompanyType(null);
    setLookupState({ kind: "idle" });
    setError(null);
  }

  async function handleLookup() {
    setLookupState({ kind: "pending" });
    setError(null);
    const result = await lookupCvrAction(values.cvr);
    if (!result.ok) {
      const key =
        result.error === "cvrInvalid"
          ? "invalidCvr"
          : result.error === "throttled"
            ? "throttled"
            : "unavailable";
      setLookupState({ kind: "message", text: t(key) });
      return;
    }
    if (result.data.status === "not_found") {
      setLookupState({ kind: "message", text: t("notFound") });
      return;
    }
    if (result.data.status === "unavailable") {
      setLookupState({ kind: "message", text: t("unavailable") });
      return;
    }
    const company = result.data.company;
    setValues({
      name: company.name,
      cvr: company.cvr,
      address: company.address ?? "",
      zipcode: company.zipcode ?? "",
      city: company.city ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      // CVR knows neither of these; they are agreed with the customer.
      invoiceEmail: "",
      eanGln: "",
      website: company.website ?? "",
    });
    setIndustry({ code: company.industryCode, text: company.industryText });
    setCompanyType(company.companyType);
    setCvrData(company.raw);
    setLookupState({ kind: "message", text: t("found", { name: company.name }), found: true });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await createCompanyAction({
      ...values,
      industryCode: industry.code,
      industryText: industry.text,
      companyType,
      cvrData,
    });
    setPending(false);
    if (!result.ok) {
      setError(
        result.error === "cvrExists"
          ? t("cvrExists")
          : result.error === "eanInvalid"
            ? t("eanInvalid")
            : t("invalidCvr"),
      );
      return;
    }
    toast.success(t("createdToast", { name: values.name }));
    setOpen(false);
    reset();
    router.push(`/companies/${result.data.companyId}`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus data-slot="icon" />
        {t("title")}
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[70svh] flex-col gap-4 overflow-y-auto pr-1"
        >
          <Field>
            <FieldLabel htmlFor="create-cvr">{t("cvrLabel")}</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="create-cvr"
                value={values.cvr}
                onChange={(event) => setValues({ ...values, cvr: event.target.value })}
                placeholder="12345678"
                inputMode="numeric"
                maxLength={20}
                className="max-w-40"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleLookup}
                disabled={lookupState.kind === "pending"}
              >
                {lookupState.kind === "pending" ? (
                  <Loader2 data-slot="icon" className="animate-spin" />
                ) : (
                  <Download data-slot="icon" />
                )}
                {t("fetch")}
              </Button>
            </div>
            {lookupState.kind === "message" ? (
              <FieldDescription className={lookupState.found ? "text-primary" : undefined}>
                {lookupState.text}
              </FieldDescription>
            ) : null}
          </Field>
          <CompanyFields values={values} onChange={setValues} idPrefix="create" />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending || values.name.trim().length === 0}>
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
