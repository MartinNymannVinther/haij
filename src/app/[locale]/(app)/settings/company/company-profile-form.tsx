"use client";

import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { lookupCvrAction } from "@/modules/crm/actions";
import { saveOrgProfileAction } from "@/modules/invoicing/actions";
import { oereToInputValue, parseKronerToOere } from "@/modules/invoicing/money";
import { useRouter } from "@/i18n/navigation";

type Profile = {
  legalName: string;
  cvr: string;
  address: string;
  zipcode: string;
  city: string;
  email: string | null;
  phone: string | null;
  bankReg: string | null;
  bankKonto: string | null;
  defaultPaymentTermsDays: number;
  defaultHourlyRateOere: number | null;
} | null;

type Fields = {
  legalName: string;
  cvr: string;
  address: string;
  zipcode: string;
  city: string;
  email: string;
  phone: string;
  bankReg: string;
  bankKonto: string;
  paymentTerms: string;
  defaultHourlyRate: string;
};

export function CompanyProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("orgProfile");
  const tLookup = useTranslations("crm.create");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fully controlled: router.refresh() after save hands the form new
  // profile props, and Base UI warns if an uncontrolled default changes.
  const [fields, setFields] = useState<Fields>({
    legalName: profile?.legalName ?? "",
    cvr: profile?.cvr ?? "",
    address: profile?.address ?? "",
    zipcode: profile?.zipcode ?? "",
    city: profile?.city ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    bankReg: profile?.bankReg ?? "",
    bankKonto: profile?.bankKonto ?? "",
    paymentTerms: String(profile?.defaultPaymentTermsDays ?? 14),
    defaultHourlyRate:
      profile?.defaultHourlyRateOere != null ? oereToInputValue(profile.defaultHourlyRateOere) : "",
  });

  function setField(name: keyof Fields) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setFields((current) => ({ ...current, [name]: event.target.value }));
  }

  async function handleLookup() {
    setLooking(true);
    const result = await lookupCvrAction(fields.cvr);
    setLooking(false);
    if (!result.ok) {
      toast.error(result.error === "cvrInvalid" ? tLookup("invalidCvr") : tCommon("error"));
      return;
    }
    if (result.data.status === "not_found") {
      toast.error(tLookup("notFound"));
      return;
    }
    if (result.data.status === "unavailable") {
      toast.error(tLookup("unavailable"));
      return;
    }
    const company = result.data.company;
    setFields((current) => ({
      ...current,
      legalName: company.name,
      address: company.address ?? current.address,
      zipcode: company.zipcode ?? current.zipcode,
      city: company.city ?? current.city,
      email: company.email ?? current.email,
      phone: company.phone ?? current.phone,
    }));
    toast.success(tLookup("found", { name: company.name }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const rateInput = fields.defaultHourlyRate.trim();
    const rateOere = rateInput ? parseKronerToOere(rateInput) : null;
    if (rateInput && (rateOere === null || rateOere < 0)) {
      setError(t("invalidRate"));
      return;
    }
    const terms = Number(fields.paymentTerms);

    setPending(true);
    const result = await saveOrgProfileAction({
      legalName: fields.legalName,
      cvr: fields.cvr,
      address: fields.address,
      zipcode: fields.zipcode,
      city: fields.city,
      email: fields.email,
      phone: fields.phone,
      bankReg: fields.bankReg,
      bankKonto: fields.bankKonto,
      defaultPaymentTermsDays: Number.isFinite(terms) ? terms : 14,
      defaultHourlyRateOere: rateOere,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error === "invalid" ? t("invalidForm") : tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("sellerTitle")}</CardTitle>
          <CardDescription>{t("sellerHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="cvr">CVR</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="cvr"
                  name="cvr"
                  required
                  inputMode="numeric"
                  maxLength={8}
                  pattern="[0-9]{8}"
                  value={fields.cvr}
                  onChange={setField("cvr")}
                  className="max-w-40"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookup}
                  disabled={looking || fields.cvr.trim().length !== 8}
                >
                  {looking ? (
                    <Loader2 data-slot="icon" className="animate-spin" />
                  ) : (
                    <Download data-slot="icon" />
                  )}
                  {tLookup("fetch")}
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="legalName">{t("legalName")}</FieldLabel>
              <Input
                id="legalName"
                name="legalName"
                required
                maxLength={200}
                value={fields.legalName}
                onChange={setField("legalName")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="address">{t("address")}</FieldLabel>
              <Input
                id="address"
                name="address"
                required
                maxLength={300}
                value={fields.address}
                onChange={setField("address")}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field>
                <FieldLabel htmlFor="zipcode">{t("zipcode")}</FieldLabel>
                <Input
                  id="zipcode"
                  name="zipcode"
                  required
                  maxLength={10}
                  value={fields.zipcode}
                  onChange={setField("zipcode")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="city">{t("city")}</FieldLabel>
                <Input
                  id="city"
                  name="city"
                  required
                  maxLength={100}
                  value={fields.city}
                  onChange={setField("city")}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  maxLength={320}
                  value={fields.email}
                  onChange={setField("email")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
                <Input
                  id="phone"
                  name="phone"
                  maxLength={30}
                  value={fields.phone}
                  onChange={setField("phone")}
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoicingTitle")}</CardTitle>
          <CardDescription>{t("invoicingHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field>
                <FieldLabel htmlFor="bankReg">{t("bankReg")}</FieldLabel>
                <Input
                  id="bankReg"
                  name="bankReg"
                  inputMode="numeric"
                  maxLength={10}
                  value={fields.bankReg}
                  onChange={setField("bankReg")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bankKonto">{t("bankKonto")}</FieldLabel>
                <Input
                  id="bankKonto"
                  name="bankKonto"
                  inputMode="numeric"
                  maxLength={20}
                  value={fields.bankKonto}
                  onChange={setField("bankKonto")}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="defaultPaymentTermsDays">{t("paymentTerms")}</FieldLabel>
                <Input
                  id="defaultPaymentTermsDays"
                  name="defaultPaymentTermsDays"
                  type="number"
                  min={0}
                  max={120}
                  required
                  value={fields.paymentTerms}
                  onChange={setField("paymentTerms")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="defaultHourlyRate">{t("defaultHourlyRate")}</FieldLabel>
                <Input
                  id="defaultHourlyRate"
                  name="defaultHourlyRate"
                  inputMode="decimal"
                  placeholder="950,00"
                  value={fields.defaultHourlyRate}
                  onChange={setField("defaultHourlyRate")}
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
