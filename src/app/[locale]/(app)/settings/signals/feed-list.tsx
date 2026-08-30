"use client";

import { AlertTriangle, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkFeedAction } from "@/modules/signals/actions";
import type { FeedCheck } from "@/modules/signals/feed-check";

export type Feed = { url: string; label: string | null };

/**
 * The list of feeds the signals engine follows.
 *
 * The old version was a textarea where each line was "url | label", which
 * gave no validation, no way to switch one off, and no answer to the only
 * question that matters when you paste an address: does it actually work?
 * Each row can be tried here, through the same fetch and parser the
 * ingestion uses, so a broken source is found in the second it is added.
 */
export function FeedList({
  feeds,
  onChange,
}: {
  feeds: Feed[];
  onChange: (feeds: Feed[]) => void;
}) {
  const t = useTranslations("signals.settings");
  const [checks, setChecks] = useState<Record<string, FeedCheck | "pending">>({});

  function update(index: number, patch: Partial<Feed>) {
    onChange(feeds.map((feed, i) => (i === index ? { ...feed, ...patch } : feed)));
    setChecks((current) => {
      const next = { ...current };
      delete next[String(index)];
      return next;
    });
  }

  async function check(index: number) {
    const feed = feeds[index];
    if (!feed?.url) return;
    setChecks((current) => ({ ...current, [String(index)]: "pending" }));
    const result = await checkFeedAction(feed.url);
    setChecks((current) => ({
      ...current,
      [String(index)]: result.ok ? result.data : { status: "unreachable" },
    }));
  }

  function describe(check: FeedCheck): { tone: "ok" | "bad"; text: string } {
    switch (check.status) {
      case "ok":
        return {
          tone: "ok",
          text: check.newestTitle
            ? t("checkOkWithTitle", { count: check.items, title: check.newestTitle })
            : t("checkOk", { count: check.items }),
        };
      case "empty":
        return { tone: "bad", text: t("checkEmpty") };
      case "not_feed":
        return { tone: "bad", text: t("checkNotFeed") };
      case "http":
        return { tone: "bad", text: t("checkHttp", { code: check.code }) };
      case "unreachable":
        return { tone: "bad", text: t("checkUnreachable") };
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {feeds.length === 0 ? <p className="text-meta text-[0.8125rem]">{t("feedsEmpty")}</p> : null}

      <ul className="flex flex-col gap-3">
        {feeds.map((feed, index) => {
          const state = checks[String(index)];
          const result = state && state !== "pending" ? describe(state) : null;
          return (
            <li key={index} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={feed.label ?? ""}
                  onChange={(event) => update(index, { label: event.target.value || null })}
                  placeholder={t("feedNamePlaceholder")}
                  maxLength={100}
                  aria-label={t("feedNamePlaceholder")}
                  className="w-44"
                />
                <Input
                  value={feed.url}
                  onChange={(event) => update(index, { url: event.target.value })}
                  placeholder="https://…"
                  maxLength={1000}
                  aria-label={t("feedUrlPlaceholder")}
                  className="min-w-56 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => check(index)}
                  disabled={!feed.url || state === "pending"}
                >
                  {state === "pending" ? (
                    <Loader2 data-slot="icon" className="animate-spin" />
                  ) : null}
                  {t("checkAction")}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("feedRemove")}
                  onClick={() => onChange(feeds.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
              {result ? (
                <p
                  className={
                    result.tone === "ok"
                      ? "text-success flex items-center gap-1.5 text-xs"
                      : "text-warning flex items-center gap-1.5 text-xs"
                  }
                >
                  {result.tone === "ok" ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0" />
                  )}
                  {result.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {feeds.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange([...feeds, { url: "", label: null }])}
        >
          <Plus data-slot="icon" />
          {t("feedAdd")}
        </Button>
      ) : (
        <p className="text-label text-xs">{t("feedsMax")}</p>
      )}
    </div>
  );
}
