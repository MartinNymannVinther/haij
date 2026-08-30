"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChipInput } from "@/components/ui/chip-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { saveSignalSettingsAction } from "@/modules/signals/actions";
import { useRouter } from "@/i18n/navigation";
import { FeedList, type Feed } from "./feed-list";

export type SignalSettingsValues = {
  serviceProfile: string;
  tedKeywords: string;
  cvrBranchePrefixes: string;
  rssFeeds: Feed[];
};

function toList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function SignalsForm({ settings }: { settings: SignalSettingsValues }) {
  const t = useTranslations("signals.settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serviceProfile, setServiceProfile] = useState(settings.serviceProfile);
  const [tedKeywords, setTedKeywords] = useState(toList(settings.tedKeywords));
  const [branchePrefixes, setBranchePrefixes] = useState(toList(settings.cvrBranchePrefixes));
  const [feeds, setFeeds] = useState<Feed[]>(settings.rssFeeds);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await saveSignalSettingsAction({
      serviceProfile,
      tedKeywords: tedKeywords.join(", "),
      cvrBranchePrefixes: branchePrefixes.join(","),
      // A row still being typed into has no business being saved.
      rssFeeds: feeds.filter((feed) => /^https?:\/\/\S+$/.test(feed.url.trim())),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("profileTitle")}</CardTitle>
          <CardDescription>{t("profileHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="serviceProfile"
            name="serviceProfile"
            rows={12}
            maxLength={4000}
            placeholder={t("profilePlaceholder")}
            value={serviceProfile}
            onChange={(event) => setServiceProfile(event.target.value)}
            className="leading-relaxed"
          />
          <p className="text-label mt-1.5 text-xs tabular-nums">
            {t("profileCount", { count: serviceProfile.length })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("feedsTitle")}</CardTitle>
          <CardDescription>{t("feedsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FeedList feeds={feeds} onChange={setFeeds} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sourcesTitle")}</CardTitle>
          <CardDescription>{t("sourcesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="cvr-chips">{t("cvrLabel")}</FieldLabel>
            <ChipInput
              label={t("cvrLabel")}
              values={branchePrefixes}
              onChange={setBranchePrefixes}
              placeholder={t("cvrPlaceholder")}
              maxLength={6}
            />
            <p className="text-meta text-xs">{t("cvrHelp")}</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="ted-chips">{t("tedLabel")}</FieldLabel>
            <ChipInput
              label={t("tedLabel")}
              values={tedKeywords}
              onChange={setTedKeywords}
              placeholder={t("tedPlaceholder")}
            />
            <p className="text-meta text-xs">{t("tedHelp")}</p>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
