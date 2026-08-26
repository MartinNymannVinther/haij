"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchKnowledgeAction, generateDigestAction } from "@/modules/knowledge/actions";
import { useRouter } from "@/i18n/navigation";

export function KnowledgeToolbar({
  hasSources,
  hasItems,
}: {
  hasSources: boolean;
  hasItems: boolean;
}) {
  const t = useTranslations("knowledge");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState<"fetch" | "digest" | null>(null);

  async function handleFetch() {
    setPending("fetch");
    const result = await fetchKnowledgeAction();
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(
      result.data.inserted > 0
        ? t("fetchedToast", { count: result.data.inserted })
        : t("fetchedEmptyToast"),
    );
    if (result.data.failedSources.length > 0) {
      toast.warning(t("fetchPartialToast", { sources: result.data.failedSources.join(", ") }));
    }
    router.refresh();
  }

  async function handleDigest() {
    setPending("digest");
    const result = await generateDigestAction();
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    if (!result.data.created) {
      toast.error(
        result.data.reason === "NO_PROVIDER"
          ? t("digestNoProvider")
          : result.data.reason === "NO_ITEMS"
            ? t("digestNoItems")
            : tCommon("error"),
      );
      return;
    }
    toast.success(t("digestToast"));
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleFetch} disabled={!hasSources || pending !== null}>
        {pending === "fetch" ? (
          <Loader2 data-slot="icon" className="animate-spin" />
        ) : (
          <RefreshCw data-slot="icon" />
        )}
        {t("fetch")}
      </Button>
      <Button onClick={handleDigest} disabled={!hasItems || pending !== null}>
        {pending === "digest" ? (
          <Loader2 data-slot="icon" className="animate-spin" />
        ) : (
          <Sparkles data-slot="icon" />
        )}
        {t("digest")}
      </Button>
    </div>
  );
}
