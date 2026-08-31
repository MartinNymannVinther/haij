"use client";

import { Eye, EyeOff, Layers, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { regroupDraftAction } from "@/modules/invoicing/actions";
import { LINE_GROUPINGS, type LineGrouping } from "@/modules/invoicing/grouping";
import { useRouter } from "@/i18n/navigation";

/**
 * How the draft's hours are presented, and what the result looks like.
 *
 * The two belong together: choosing a grouping without seeing the outcome
 * is guesswork, and the preview is the same PDF the customer receives —
 * stamped UDKAST and without a number, so it can never pass for the real
 * document.
 *
 * The preview reloads on a key that changes with every regroup, because a
 * browser will happily show the PDF it fetched a moment ago.
 */
export function DraftPreview({
  invoiceId,
  hasTimeEntries,
}: {
  invoiceId: string;
  hasTimeEntries: boolean;
}) {
  const t = useTranslations("invoicing.editor");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [grouping, setGrouping] = useState<LineGrouping>("entry");
  const [version, setVersion] = useState(0);

  async function handleGrouping(next: LineGrouping) {
    setGrouping(next);
    setPending(true);
    const result = await regroupDraftAction(invoiceId, next);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error === "noUnbilledTime" ? t("regroupNoTime") : tCommon("error"));
      return;
    }
    setVersion((current) => current + 1);
    router.refresh();
  }

  const items = LINE_GROUPINGS.map((value) => ({ value, label: t(`grouping.${value}`) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {hasTimeEntries ? (
          <>
            <Layers className="text-label size-4 shrink-0" />
            <Select
              items={items}
              value={grouping}
              onValueChange={(value) => handleGrouping(value as LineGrouping)}
              disabled={pending}
            >
              <SelectTrigger size="sm" aria-label={t("groupingLabel")} className="min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pending ? <Loader2 className="text-label size-4 animate-spin" /> : null}
          </>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <EyeOff data-slot="icon" /> : <Eye data-slot="icon" />}
          {open ? t("hidePreview") : t("showPreview")}
        </Button>
      </div>

      {open ? (
        <div className="border-border bg-muted overflow-hidden rounded-lg border">
          <iframe
            key={version}
            title={t("previewTitle")}
            src={`/api/invoices/${invoiceId}/pdf?v=${version}#view=FitH`}
            className="h-[70vh] w-full"
          />
          <p className="text-meta border-hairline border-t px-3 py-2 text-xs">{t("previewHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
