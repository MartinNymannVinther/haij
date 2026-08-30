"use client";

import { ArrowRight, Loader2, Plus } from "lucide-react";
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
  createDraftAction,
  createDraftFromTimeAction,
  unbilledSummaryAction,
} from "@/modules/invoicing/actions";
import { formatOere } from "@/modules/invoicing/money";
import type { UnbilledCustomer } from "@/modules/invoicing/economy";
import { formatMinutes } from "@/modules/time/duration";
import { useRouter } from "@/i18n/navigation";

/**
 * An invoice nearly always starts from hours somebody has tracked, so the
 * dialog opens on the customers who have unbilled time rather than on an
 * empty form. Picking one builds the draft from those hours; the date
 * fields narrow it when only part of the period should go on this
 * invoice. The blank invoice stays available for everything else.
 */
export function NewInvoiceButton({ customers }: { customers: UnbilledCustomer[] }) {
  const t = useTranslations("invoicing.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [range, setRange] = useState({ from: "", to: "" });
  const [narrowed, setNarrowed] = useState<Record<string, number>>({});

  function handleOpen() {
    if (customers.length === 0) {
      void createBlank();
      return;
    }
    setRange({ from: "", to: "" });
    setNarrowed({});
    setOpen(true);
  }

  async function createBlank() {
    setPending("blank");
    const result = await createDraftAction();
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    router.push(`/invoices/${result.data.invoiceId}`);
  }

  function updateRange(field: "from" | "to") {
    return async (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = { ...range, [field]: event.target.value };
      setRange(next);
      if (!next.from && !next.to) {
        setNarrowed({});
        return;
      }
      // One summary per customer keeps the hours on screen honest while
      // the dates are being adjusted.
      const results = await Promise.all(
        customers.map(async (customer) => {
          const result = await unbilledSummaryAction(customer.companyId, {
            from: next.from || null,
            to: next.to || null,
          });
          return [customer.companyId, result.ok ? result.data.minutes : 0] as const;
        }),
      );
      setNarrowed(Object.fromEntries(results));
    };
  }

  async function createFromTime(companyId: string) {
    setPending(companyId);
    const result = await createDraftFromTimeAction(companyId, {
      from: range.from || null,
      to: range.to || null,
    });
    setPending(null);
    if (!result.ok) {
      toast.error(result.error === "noUnbilledTime" ? t("noUnbilledTime") : tCommon("error"));
      return;
    }
    setOpen(false);
    router.push(`/invoices/${result.data.invoiceId}`);
  }

  return (
    <>
      <Button onClick={handleOpen} disabled={pending !== null}>
        {pending === "blank" ? (
          <Loader2 data-slot="icon" className="animate-spin" />
        ) : (
          <Plus data-slot="icon" />
        )}
        {t("create")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("fromTimeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-meta text-[0.8125rem] leading-relaxed">{t("fromTimeHint")}</p>

            <ul className="flex flex-col">
              {customers.map((customer) => {
                const minutes = narrowed[customer.companyId] ?? customer.minutes;
                const empty = minutes === 0;
                return (
                  <li key={customer.companyId} className="border-hairline border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => createFromTime(customer.companyId)}
                      disabled={empty || pending !== null}
                      className="hover:bg-background flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors duration-[120ms] disabled:opacity-45 disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {customer.companyName}
                      </span>
                      <span className="text-meta shrink-0 tabular-nums">
                        {formatMinutes(minutes)}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatOere(
                          empty
                            ? 0
                            : Math.round(
                                (customer.valueOere * minutes) / Math.max(customer.minutes, 1),
                              ),
                        )}
                      </span>
                      {pending === customer.companyId ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <ArrowRight className="text-label size-4 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="new-invoice-from">{t("fromDate")}</FieldLabel>
                <Input
                  id="new-invoice-from"
                  type="date"
                  value={range.from}
                  onChange={updateRange("from")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-invoice-to">{t("toDate")}</FieldLabel>
                <Input
                  id="new-invoice-to"
                  type="date"
                  value={range.to}
                  onChange={updateRange("to")}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={createBlank}
              disabled={pending !== null}
            >
              {pending === "blank" ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("blankInvoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
