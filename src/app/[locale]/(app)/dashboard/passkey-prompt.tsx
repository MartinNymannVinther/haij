"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/core/auth/client";
import { useRouter } from "@/i18n/navigation";

/** Nudges the user to add a passkey; hidden once they have one. */
export function PasskeyPrompt() {
  const t = useTranslations("app.dashboard");
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authClient.passkey
      .listUserPasskeys()
      .then(({ data }) => {
        if (!cancelled && (data?.length ?? 0) === 0) setVisible(true);
      })
      .catch(() => {
        // Best-effort nudge only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {t("passkeyPromptTitle")}
        </CardTitle>
        <CardDescription>{t("passkeyPromptBody")}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => router.push("/settings/security")}>
            {t("passkeyPromptCta")}
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
