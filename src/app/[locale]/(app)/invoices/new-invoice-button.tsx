"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDraftAction } from "@/modules/invoicing/actions";
import { useRouter } from "@/i18n/navigation";

export function NewInvoiceButton() {
  const t = useTranslations("invoicing.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await createDraftAction();
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    router.push(`/invoices/${result.data.invoiceId}`);
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : <Plus data-slot="icon" />}
      {t("create")}
    </Button>
  );
}
