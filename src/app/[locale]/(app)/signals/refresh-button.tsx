"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshSignalsAction } from "@/modules/signals/actions";
import { useRouter } from "@/i18n/navigation";

export function RefreshButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("signals");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleRefresh() {
    setPending(true);
    const result = await refreshSignalsAction();
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    const failed = result.data.sources.filter((s) => s.status === "unavailable");
    if (result.data.inserted > 0) {
      toast.success(t("refreshedToast", { count: result.data.inserted }));
    } else {
      toast.success(t("refreshedEmptyToast"));
    }
    if (failed.length > 0) {
      toast.warning(t("refreshPartialToast", { sources: failed.map((s) => s.source).join(", ") }));
    }
    router.refresh();
  }

  return (
    <Button onClick={handleRefresh} disabled={disabled || pending}>
      {pending ? (
        <Loader2 data-slot="icon" className="animate-spin" />
      ) : (
        <RefreshCw data-slot="icon" />
      )}
      {t("refresh")}
    </Button>
  );
}
