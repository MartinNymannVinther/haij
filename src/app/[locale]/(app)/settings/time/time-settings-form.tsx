"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveTimeSettingsAction } from "@/modules/time/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * One setting, saved the moment it is flipped. A save button for a single
 * switch is a step that adds nothing; the toast is the receipt, and a
 * failed save puts the switch back where it was.
 */
export function TimeSettingsForm({ prefillFromLastEntry }: { prefillFromLastEntry: boolean }) {
  const t = useTranslations("time.settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [enabled, setEnabled] = useState(prefillFromLastEntry);
  const [pending, setPending] = useState(false);

  async function handleToggle(next: boolean) {
    setEnabled(next);
    setPending(true);
    const result = await saveTimeSettingsAction({ prefillFromLastEntry: next });
    setPending(false);
    if (!result.ok) {
      setEnabled(!next);
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("prefillTitle")}</CardTitle>
        <CardDescription>{t("prefillHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => handleToggle(event.target.checked)}
            disabled={pending}
            className="accent-primary size-4 shrink-0 cursor-pointer"
          />
          <span className="font-medium">{t("prefillLabel")}</span>
        </label>
      </CardContent>
    </Card>
  );
}
