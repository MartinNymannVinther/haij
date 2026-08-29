"use client";

import { Trash2 } from "lucide-react";
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
import { deleteDraftAction } from "@/modules/invoicing/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * Deleting a draft straight from the list, so clearing out several does
 * not mean opening each one. Only drafts: an issued invoice is a
 * document, and the way back from one of those is a credit note.
 */
export function DraftDeleteButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const t = useTranslations("invoicing.detail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await deleteDraftAction(invoiceId);
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    setOpen(false);
    toast.success(t("deletedToast"));
    router.refresh();
  }

  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${tCommon("delete")} ${label}`}
        // The row has a full-cell link overlay; this sits above it.
        className="relative z-10 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-meta text-[0.8125rem] leading-relaxed">{t("deleteBody")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
