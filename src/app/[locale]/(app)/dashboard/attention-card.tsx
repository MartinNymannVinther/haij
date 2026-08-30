import { ArrowUpRight, Sparkles, Radar } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LatestDigest } from "@/modules/knowledge/service";
import type { TopSignal } from "@/modules/signals/service";
import { Link } from "@/i18n/navigation";

/** First paragraph, or the opening of a long one. Enough to decide whether to read on. */
function excerpt(text: string, max = 320): string {
  const paragraph =
    text
      .trim()
      .split(/\n\s*\n/)[0]
      ?.trim() ?? "";
  if (paragraph.length <= max) return paragraph;
  const cut = paragraph.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/**
 * What is worth knowing right now: the highest-scored unhandled signal
 * and the newest knowledge digest. Both are read from what is already
 * stored, so opening the overview never waits on a model.
 */
export async function AttentionCard({
  signal,
  digest,
}: {
  signal: TopSignal | null;
  digest: LatestDigest | null;
}) {
  if (!signal && !digest) return null;
  const [t, format] = await Promise.all([
    getTranslations("app.dashboard.attention"),
    getFormatter(),
  ]);

  return (
    <div className="grid gap-4 @3xl:grid-cols-2">
      {signal ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Radar className="size-4" />
                {t("signalTitle")}
              </span>
              <Link
                href="/signals"
                className="text-primary text-[0.8125rem] font-medium hover:underline"
              >
                {t("signalLink")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="flex items-baseline gap-2">
              <span className="text-primary text-[0.78rem] font-semibold tabular-nums">
                {signal.score}
              </span>
              <span className="min-w-0 font-medium">
                {signal.url ? (
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline underline-offset-4"
                  >
                    {signal.title}
                    <ArrowUpRight className="text-meta ml-1 inline size-3.5" />
                  </a>
                ) : (
                  signal.title
                )}
              </span>
            </p>
            {signal.scoreReason ? (
              <p className="text-meta text-[0.8125rem] leading-relaxed">{signal.scoreReason}</p>
            ) : null}
            {signal.suggestion ? (
              <p className="bg-accent text-accent-foreground rounded-md px-3 py-2 text-[0.8125rem] leading-relaxed">
                {signal.suggestion}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {digest ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Sparkles className="size-4" />
                {t("digestTitle")}
              </span>
              <Link
                href="/knowledge"
                className="text-primary text-[0.8125rem] font-medium hover:underline"
              >
                {t("digestLink")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-label text-xs">
              {format.dateTime(digest.createdAt, { dateStyle: "medium" })}
              {" · "}
              {t("digestMeta", { count: digest.itemCount })}
            </p>
            <p className="text-[0.845rem] leading-relaxed">{excerpt(digest.content)}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
