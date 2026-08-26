"use client";

import { Loader2, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveSignalSettingsAction } from "@/modules/signals/actions";
import { useRouter } from "@/i18n/navigation";

export type SettingsValues = {
  serviceProfile: string;
  tedKeywords: string;
  cvrBranchePrefixes: string;
  rssFeeds: Array<{ url: string; label?: string | null }>;
};

/** One URL per line, optionally "url | label". */
function feedsToText(feeds: SettingsValues["rssFeeds"]): string {
  return feeds.map((feed) => (feed.label ? `${feed.url} | ${feed.label}` : feed.url)).join("\n");
}

function textToFeeds(text: string): Array<{ url: string; label: string | null }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => {
      const [url, ...rest] = line.split("|");
      return { url: url!.trim(), label: rest.join("|").trim() || null };
    })
    .filter((feed) => /^https?:\/\//.test(feed.url));
}

export function SignalsSettingsDialog({ settings }: { settings: SettingsValues }) {
  const t = useTranslations("signals.settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await saveSignalSettingsAction({
      serviceProfile: String(form.get("serviceProfile") ?? ""),
      tedKeywords: String(form.get("tedKeywords") ?? ""),
      cvrBranchePrefixes: String(form.get("cvrBranchePrefixes") ?? ""),
      rssFeeds: textToFeeds(String(form.get("rssFeeds") ?? "")),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings2 data-slot="icon" />
        {t("trigger")}
      </Button>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="serviceProfile">{t("profileLabel")}</FieldLabel>
            <Textarea
              id="serviceProfile"
              name="serviceProfile"
              rows={4}
              maxLength={4000}
              placeholder={t("profilePlaceholder")}
              defaultValue={settings.serviceProfile}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="tedKeywords">{t("tedLabel")}</FieldLabel>
              <Input
                id="tedKeywords"
                name="tedKeywords"
                maxLength={500}
                placeholder={t("tedPlaceholder")}
                defaultValue={settings.tedKeywords}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cvrBranchePrefixes">{t("cvrLabel")}</FieldLabel>
              <Input
                id="cvrBranchePrefixes"
                name="cvrBranchePrefixes"
                maxLength={200}
                placeholder={t("cvrPlaceholder")}
                defaultValue={settings.cvrBranchePrefixes}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="rssFeeds">{t("rssLabel")}</FieldLabel>
            <Textarea
              id="rssFeeds"
              name="rssFeeds"
              rows={3}
              placeholder={t("rssPlaceholder")}
              defaultValue={feedsToText(settings.rssFeeds)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
