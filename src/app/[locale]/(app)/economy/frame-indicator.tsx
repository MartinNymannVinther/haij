"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/modules/time/duration";
import { formatOere } from "@/modules/invoicing/money";

/**
 * Consumption bars for a customer's agreed frames: tracked hours against
 * the hour frame, invoiced net against the amount frame. Turns amber at
 * 80 % and destructive when the frame is exceeded.
 */
export function FrameIndicator({
  budgetMinutes,
  budgetAmountOere,
  trackedMinutes,
  invoicedNetOere,
}: {
  budgetMinutes: number | null;
  budgetAmountOere: number | null;
  trackedMinutes: number;
  invoicedNetOere: number;
}) {
  const t = useTranslations("economy");

  if (!budgetMinutes && !budgetAmountOere) {
    return <span className="text-muted-foreground text-xs">{t("noFrame")}</span>;
  }

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {budgetMinutes ? (
        <FrameBar
          label={t("hourFrame", {
            used: formatMinutes(trackedMinutes),
            frame: formatMinutes(budgetMinutes),
          })}
          ratio={trackedMinutes / budgetMinutes}
        />
      ) : null}
      {budgetAmountOere ? (
        <FrameBar
          label={t("amountFrame", {
            used: formatOere(invoicedNetOere),
            frame: formatOere(budgetAmountOere),
          })}
          ratio={budgetAmountOere > 0 ? invoicedNetOere / budgetAmountOere : 0}
        />
      ) : null}
    </div>
  );
}

function FrameBar({ label, ratio }: { label: string; ratio: number }) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  const over = ratio > 1;
  const warn = !over && ratio >= 0.8;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "text-xs tabular-nums",
          over ? "text-destructive font-medium" : warn ? "font-medium" : "text-muted-foreground",
        )}
      >
        {label}
        {over ? ` · ${Math.round(ratio * 100)} %` : ""}
      </span>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-destructive" : warn ? "bg-primary/70" : "bg-primary",
          )}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}
