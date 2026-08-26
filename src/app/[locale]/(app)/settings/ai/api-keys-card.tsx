"use client";

import { Copy, KeyRound, Loader2, Plus, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, revokeApiKeyAction } from "@/modules/mcp/actions";
import { useRouter } from "@/i18n/navigation";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export function ApiKeysCard({ keys, mcpUrl }: { keys: ApiKeyRow[]; mcpUrl: string }) {
  const t = useTranslations("ai.apiKeys");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const name = String(new FormData(formElement).get("name") ?? "").trim();
    if (!name) return;
    setPending(true);
    const result = await createApiKeyAction(name);
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    formElement.reset();
    setFreshKey(result.data.plaintext);
    router.refresh();
  }

  async function handleRevoke(keyId: string) {
    setBusy(keyId);
    const result = await revokeApiKeyAction(keyId);
    setBusy(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("revokedToast"));
    router.refresh();
  }

  async function copyFreshKey() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      toast.success(t("copiedToast"));
    } catch {
      toast.error(tCommon("error"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {keys.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {keys.map((key) => (
              <li
                key={key.id}
                className="border-border flex items-center gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{key.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">{key.keyPrefix}…</p>
                </div>
                {key.revokedAt ? (
                  <Badge className="border-border bg-transparent text-muted-foreground">
                    {t("revoked")}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleRevoke(key.id)}
                    disabled={busy === key.id}
                  >
                    <ShieldOff data-slot="icon" />
                    {t("revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            name="name"
            placeholder={t("namePlaceholder")}
            maxLength={100}
            required
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? (
              <Loader2 data-slot="icon" className="animate-spin" />
            ) : (
              <Plus data-slot="icon" />
            )}
            {t("create")}
          </Button>
        </form>

        <div className="text-muted-foreground text-xs leading-relaxed">
          <p>{t("connectHint")}</p>
          <pre className="bg-muted mt-1.5 overflow-x-auto rounded-lg p-2.5 font-mono">
            {`claude mcp add --transport http haij ${mcpUrl} \\\n  --header "Authorization: Bearer <nøgle>"`}
          </pre>
        </div>
      </CardContent>

      <Dialog open={freshKey !== null} onOpenChange={(open) => !open && setFreshKey(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createdTitle")}</DialogTitle>
            <DialogDescription>{t("createdHint")}</DialogDescription>
          </DialogHeader>
          <div className="bg-muted flex items-center gap-2 rounded-lg p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm">{freshKey}</code>
            <Button size="icon-sm" variant="outline" aria-label={t("copy")} onClick={copyFreshKey}>
              <Copy />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setFreshKey(null)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
