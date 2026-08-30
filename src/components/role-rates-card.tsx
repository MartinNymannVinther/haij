"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteRoleRateAction, setRoleRateAction } from "@/modules/invoicing/actions";
import { formatOere, parseKronerToOere } from "@/modules/invoicing/money";
import { useRouter } from "@/i18n/navigation";

export type RoleRateRow = {
  id: string;
  roleId: string;
  roleName: string;
  hourlyRateOere: number;
};

/**
 * Agreed hourly rates for roles, on a customer or on a project. The same
 * card serves both: the scope decides the copy and which id the action
 * carries. On a project, `inherited` holds the customer's agreed rate per
 * role so the placeholder shows what is being overridden.
 */
export function RoleRatesCard({
  scope,
  scopeId,
  rates,
  availableRoles,
  inherited,
}: {
  scope: "company" | "project";
  scopeId: string;
  rates: RoleRateRow[];
  availableRoles: Array<{ id: string; name: string }>;
  inherited?: Record<string, number>;
}) {
  const t = useTranslations("orgProfile.roleRates");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);

  const items = availableRoles.map((role) => ({ value: role.id, label: role.name }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rate = parseKronerToOere(String(form.get("rate") ?? ""));
    if (!roleId || rate === null || rate < 0) {
      toast.error(t("invalid"));
      return;
    }
    setPending(true);
    const result = await setRoleRateAction({
      roleId,
      hourlyRateOere: rate,
      ...(scope === "company" ? { companyId: scopeId } : { projectId: scopeId }),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    formElement.reset();
    setRoleId(null);
    router.refresh();
  }

  async function handleDelete(rateId: string) {
    setBusy(rateId);
    const result = await deleteRoleRateAction(rateId);
    setBusy(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("deletedToast"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{scope === "company" ? t("companyTitle") : t("projectTitle")}</CardTitle>
        <CardDescription>
          {scope === "company" ? t("companyHint") : t("projectHint")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rates.length === 0 ? (
          <p className="text-meta text-[0.8125rem]">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {rates.map((rate) => (
              <li
                key={rate.id}
                className="group border-hairline flex items-center gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{rate.roleName}</span>
                {inherited?.[rate.roleId] !== undefined &&
                inherited[rate.roleId] !== rate.hourlyRateOere ? (
                  <span className="text-label shrink-0 text-xs tabular-nums">
                    {t("inherited", { rate: formatOere(inherited[rate.roleId]!) })}
                  </span>
                ) : null}
                <span className="shrink-0 tabular-nums">
                  {t("rateLine", { rate: formatOere(rate.hourlyRateOere) })}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tCommon("delete")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(rate.id)}
                  disabled={busy === rate.id}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {availableRoles.length === 0 ? (
          rates.length === 0 ? (
            <p className="text-label text-[0.8125rem]">{t("emptyNoRoles")}</p>
          ) : null
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            <Select
              items={items}
              value={roleId}
              onValueChange={(value) => setRoleId((value as string) ?? null)}
            >
              <SelectTrigger aria-label={t("rolePlaceholder")} className="min-w-44 flex-1">
                <SelectValue placeholder={t("rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              name="rate"
              inputMode="decimal"
              placeholder={
                roleId && inherited?.[roleId] !== undefined
                  ? t("inherited", { rate: formatOere(inherited[roleId]!) })
                  : t("ratePlaceholder")
              }
              required
              className="w-48"
              aria-label={t("ratePlaceholder")}
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? (
                <Loader2 data-slot="icon" className="animate-spin" />
              ) : (
                <Plus data-slot="icon" />
              )}
              {t("add")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
