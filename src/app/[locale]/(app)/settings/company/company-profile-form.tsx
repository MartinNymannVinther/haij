"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

export function CompanyProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("orgProfile");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);

    const rateInput = String(form.get("defaultHourlyRate") ?? "").trim();
    const rateOere = rateInput ? parseKronerToOere(rateInput) : null;
    if (rateInput && (rateOere === null || rateOere < 0)) {
      setError(t("invalidRate"));
      return;
    }
    const terms = Number(form.get("defaultPaymentTermsDays") ?? 14);

    setPending(true);
    const result = await saveOrgProfileAction({
      legalName: String(form.get("legalName") ?? ""),
      cvr: String(form.get("cvr") ?? ""),
      address: String(form.get("address") ?? ""),
      zipcode: String(form.get("zipcode") ?? ""),
      city: String(form.get("city") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      bankReg: String(form.get("bankReg") ?? ""),
      bankKonto: String(form.get("bankKonto") ?? ""),
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
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("sellerTitle")}</CardTitle>
          <CardDescription>{t("sellerHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field>
                <FieldLabel htmlFor="legalName">{t("legalName")}</FieldLabel>
                <Input
                  id="legalName"
                  name="legalName"
                  required
                  maxLength={200}
                  defaultValue={profile?.legalName ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cvr">CVR</FieldLabel>
                <Input
                  id="cvr"
                  name="cvr"
                  required
                  inputMode="numeric"
                  maxLength={8}
                  pattern="[0-9]{8}"
                  defaultValue={profile?.cvr ?? ""}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="address">{t("address")}</FieldLabel>
              <Input
                id="address"
                name="address"
                required
                maxLength={300}
                defaultValue={profile?.address ?? ""}
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
                  defaultValue={profile?.zipcode ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="city">{t("city")}</FieldLabel>
                <Input
                  id="city"
                  name="city"
                  required
                  maxLength={100}
                  defaultValue={profile?.city ?? ""}
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
                  defaultValue={profile?.email ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
                <Input id="phone" name="phone" maxLength={30} defaultValue={profile?.phone ?? ""} />
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
                  defaultValue={profile?.bankReg ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bankKonto">{t("bankKonto")}</FieldLabel>
                <Input
                  id="bankKonto"
                  name="bankKonto"
                  inputMode="numeric"
                  maxLength={20}
                  defaultValue={profile?.bankKonto ?? ""}
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
                  defaultValue={profile?.defaultPaymentTermsDays ?? 14}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="defaultHourlyRate">{t("defaultHourlyRate")}</FieldLabel>
                <Input
                  id="defaultHourlyRate"
                  name="defaultHourlyRate"
                  inputMode="decimal"
                  placeholder="950,00"
                  defaultValue={
                    profile?.defaultHourlyRateOere != null
                      ? oereToInputValue(profile.defaultHourlyRateOere)
                      : ""
                  }
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
