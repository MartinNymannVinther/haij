"use client";

import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type CompanyFormValues = {
  name: string;
  cvr: string;
  address: string;
  zipcode: string;
  city: string;
  phone: string;
  email: string;
  website: string;
};

export const EMPTY_COMPANY: CompanyFormValues = {
  name: "",
  cvr: "",
  address: "",
  zipcode: "",
  city: "",
  phone: "",
  email: "",
  website: "",
};

export function CompanyFields({
  values,
  onChange,
  idPrefix,
}: {
  values: CompanyFormValues;
  onChange: (values: CompanyFormValues) => void;
  idPrefix: string;
}) {
  const t = useTranslations("crm.form");
  const set = (key: keyof CompanyFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: event.target.value });

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>{t("name")}</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={set("name")}
          required
          maxLength={200}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-address`}>{t("address")}</FieldLabel>
        <Input
          id={`${idPrefix}-address`}
          value={values.address}
          onChange={set("address")}
          maxLength={300}
        />
      </Field>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-zipcode`}>{t("zipcode")}</FieldLabel>
          <Input
            id={`${idPrefix}-zipcode`}
            value={values.zipcode}
            onChange={set("zipcode")}
            maxLength={10}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-city`}>{t("city")}</FieldLabel>
          <Input
            id={`${idPrefix}-city`}
            value={values.city}
            onChange={set("city")}
            maxLength={100}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-phone`}>{t("phone")}</FieldLabel>
          <Input
            id={`${idPrefix}-phone`}
            value={values.phone}
            onChange={set("phone")}
            maxLength={30}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-email`}>{t("email")}</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={values.email}
            onChange={set("email")}
            maxLength={320}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-website`}>{t("website")}</FieldLabel>
        <Input
          id={`${idPrefix}-website`}
          value={values.website}
          onChange={set("website")}
          maxLength={300}
        />
      </Field>
    </FieldGroup>
  );
}
