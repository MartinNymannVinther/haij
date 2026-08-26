"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteContactAction } from "@/modules/crm/actions";
import { useRouter } from "@/i18n/navigation";

export function ContactDeleteButton({ contactId }: { contactId: string }) {
  const t = useTranslations("crm.contacts");
  const router = useRouter();

  async function handleDelete() {
    const result = await deleteContactAction(contactId);
    if (result.ok) {
      toast.success(t("removedToast"));
      router.refresh();
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("remove")}
      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      onClick={handleDelete}
    >
      <X />
    </Button>
  );
}
