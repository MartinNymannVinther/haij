"use client";

import { Eye, ExternalLink, Layers, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
 * The preview opens in a dialog rather than inline: an A4 page squeezed
 * into half a screen is unreadable, which defeats the point of showing it
 * at all. It is the same PDF the customer receives, stamped UDKAST and
 * without a number, so it can never pass for the real document.
 *
 * The frame reloads on a key that changes with every regroup — a browser
 * will otherwise show the PDF it fetched a moment ago.
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
  const src = `/api/invoices/${invoiceId}/pdf?v=${version}`;

  return (
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
        onClick={() => setOpen(true)}
      >
        <Eye data-slot="icon" />
        {t("showPreview")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[92vh] max-h-none w-[min(1100px,95vw)] max-w-none flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-8">
              {t("previewTitle")}
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex items-center gap-1.5 text-[0.8125rem] font-medium hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {t("openInTab")}
              </a>
            </DialogTitle>
          </DialogHeader>
          <iframe
            key={version}
            title={t("previewTitle")}
            src={`${src}#view=FitH`}
            className="border-border bg-muted min-h-0 flex-1 rounded-lg border"
          />
          <p className="text-meta text-xs">{t("previewHint")}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
