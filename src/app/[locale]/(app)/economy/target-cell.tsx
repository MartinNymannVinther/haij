"use client";

import { Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setRevenueTargetAction } from "@/modules/invoicing/actions";
import { formatOere, oereToInputValue, parseKronerToOere } from "@/modules/invoicing/money";
import { useRouter } from "@/i18n/navigation";

/** Inline editor for one month's revenue target. */
export function TargetCell({
  year,
  month,
  targetOere,
}: {
  year: number;
  month: number;
  targetOere: number | null;
}) {
  const t = useTranslations("economy");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("target") ?? "").trim();
    const oere = raw ? parseKronerToOere(raw) : 0;
    if (oere === null || oere < 0) {
      toast.error(t("invalidTarget"));
      return;
    }
    setPending(true);
    const result = await setRevenueTargetAction({ year, month, revenueTargetOere: oere });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center justify-end gap-1.5">
        <Input
          name="target"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          defaultValue={targetOere != null && targetOere > 0 ? oereToInputValue(targetOere) : ""}
          className="h-7 w-28 text-right text-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button type="submit" size="sm" className="h-7" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : tCommon("save")}
        </Button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group hover:text-foreground inline-flex items-center gap-1.5 tabular-nums"
      aria-label={t("editTarget")}
    >
      <Pencil className="text-muted-foreground size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      {targetOere != null ? (
        formatOere(targetOere)
      ) : (
        <span className="text-muted-foreground">{t("setTarget")}</span>
      )}
    </button>
  );
}
