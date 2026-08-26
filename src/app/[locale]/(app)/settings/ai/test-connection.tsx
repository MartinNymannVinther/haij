"use client";

import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { testLlmAction, type LlmTestResult } from "./actions";

export function TestConnection() {
  const t = useTranslations("ai");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LlmTestResult | null>(null);

  async function handleTest() {
    setPending(true);
    setResult(null);
    const outcome = await testLlmAction();
    setPending(false);
    setResult(outcome);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="outline" onClick={handleTest} disabled={pending}>
          {pending ? (
            <Loader2 data-slot="icon" className="animate-spin" />
          ) : (
            <PlugZap data-slot="icon" />
          )}
          {t("test")}
        </Button>
      </div>

      {result && result.status === "ok" ? (
        <div className="border-border flex items-start gap-2 rounded-lg border p-3 text-sm">
          <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t("testOk")}</p>
            <p className="text-muted-foreground">
              {t("testOkDetail", { model: result.model, sample: result.sample })}
            </p>
          </div>
        </div>
      ) : null}

      {result && result.status === "failed" ? (
        <div className="border-destructive/30 flex items-start gap-2 rounded-lg border p-3 text-sm">
          <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t("testFailed")}</p>
            <p className="text-muted-foreground">
              {result.reason === "auth"
                ? t("failAuth")
                : result.reason === "unreachable"
                  ? t("failUnreachable")
                  : result.reason === "config"
                    ? t("failConfig", { detail: result.detail })
                    : t("failGeneric")}
            </p>
          </div>
        </div>
      ) : null}

      {result && result.status === "none" ? (
        <p className="text-muted-foreground text-sm">{t("disabled")}</p>
      ) : null}
    </div>
  );
}
