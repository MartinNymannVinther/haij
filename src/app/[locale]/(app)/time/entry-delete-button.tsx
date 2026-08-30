"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTimeEntryAction } from "@/modules/time/actions";
import { useRouter } from "@/i18n/navigation";

export function EntryDeleteButton({ entryId }: { entryId: string }) {
  const t = useTranslations("time");
  const tCommon = useTranslations("common");
  const router = useRouter();

  async function handleDelete() {
    const result = await deleteTimeEntryAction(entryId);
    if (result.ok) {
      toast.success(t("deletedToast"));
      router.refresh();
      return;
    }
    toast.error(result.error === "invoiced" ? t("invoicedCannotDelete") : tCommon("error"));
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("delete")}
      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      onClick={handleDelete}
    >
      <X />
    </Button>
  );
}
