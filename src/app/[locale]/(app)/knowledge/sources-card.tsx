"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addKnowledgeSourceAction,
  deleteKnowledgeSourceAction,
  setKnowledgeSourceActiveAction,
} from "@/modules/knowledge/actions";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type SourceRow = {
  id: string;
  name: string;
  url: string;
  active: boolean;
};

export function SourcesCard({ sources }: { sources: SourceRow[] }) {
  const t = useTranslations("knowledge.sources");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    const result = await addKnowledgeSourceAction({
      name: String(form.get("name") ?? ""),
      url: String(form.get("url") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(
        result.error === "invalid"
          ? t("invalid")
          : result.error === "limit"
            ? t("limit")
            : tCommon("error"),
      );
      return;
    }
    formElement.reset();
    router.refresh();
  }

  async function handleToggle(source: SourceRow) {
    setBusy(source.id);
    const result = await setKnowledgeSourceActiveAction(source.id, !source.active);
    setBusy(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    router.refresh();
  }

  async function handleDelete(sourceId: string) {
    setBusy(sourceId);
    const result = await deleteKnowledgeSourceAction(sourceId);
    setBusy(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("deletedToast"));
    router.refresh();
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sources.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {sources.map((source) => (
              <li
                key={source.id}
                className="group border-border flex items-center gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={source.active}
                  onChange={() => handleToggle(source)}
                  disabled={busy === source.id}
                  aria-label={t("activeToggle", { name: source.name })}
                  className="accent-primary size-4 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-medium", !source.active && "text-muted-foreground")}>
                    {source.name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{source.url}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tCommon("delete")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(source.id)}
                  disabled={busy === source.id}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <Input name="name" placeholder={t("namePlaceholder")} maxLength={100} required />
          <div className="flex gap-2">
            <Input
              name="url"
              type="url"
              placeholder={t("urlPlaceholder")}
              maxLength={1000}
              required
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? (
                <Loader2 data-slot="icon" className="animate-spin" />
              ) : (
                <Plus data-slot="icon" />
              )}
              {t("add")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
