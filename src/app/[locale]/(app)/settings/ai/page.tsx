import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/core/auth/session";
import { env } from "@/core/env";
import { getLlmProvider } from "@/core/llm";
import { listApiKeys } from "@/modules/mcp/keys";
import { redirect } from "@/i18n/navigation";
import { ApiKeysCard } from "./api-keys-card";
import { TestConnection } from "./test-connection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ai");
  return { title: t("title") };
}

export default async function AiSettingsPage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("ai");
  const provider = getLlmProvider();
  const keys = await listApiKeys(context!);
  const mcpUrl = `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/mcp`;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-[0.78rem] leading-relaxed">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            {t("providerTitle")}
          </CardTitle>
          <CardDescription>{t("providerHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {provider ? (
            <>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("provider")}</span>
                  <Badge className="border-transparent bg-primary/15 text-primary">
                    {provider.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("model")}</span>
                  <span className="font-medium tabular-nums">{provider.model}</span>
                </div>
              </div>
              <TestConnection />
            </>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <Badge className="border-border bg-transparent text-muted-foreground w-fit">
                {t("disabled")}
              </Badge>
              <p className="text-muted-foreground">{t("setupIntro")}</p>
              <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed">
                {`# .env — EU-hostet (Mistral)\nLLM_PROVIDER=mistral\nMISTRAL_API_KEY=din-nøgle-her\n\n# eller lokalt (Ollama)\nLLM_PROVIDER=ollama\nOLLAMA_BASE_URL=http://localhost:11434`}
              </pre>
              <p className="text-muted-foreground">{t("setupOutro")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ApiKeysCard keys={keys} mcpUrl={mcpUrl} />

      <Card>
        <CardHeader>
          <CardTitle>{t("principlesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>{t("principleSovereign")}</p>
          <p>{t("principleApproval")}</p>
          <p>{t("principleUsage")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
