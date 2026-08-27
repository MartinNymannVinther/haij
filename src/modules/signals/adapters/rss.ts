import { createHash } from "node:crypto";
import { parseFeed } from "@/core/ingest/rss";
import type { AdapterResult, RawSignal, SourceAdapter } from "./types";

type FetchLike = typeof fetch;

export type FeedConfig = { url: string; label?: string | null };

const MAX_BYTES = 1_000_000;

/**
 * Follows the org's own list of RSS/Atom feeds. Covers job postings too:
 * Jobindex exposes any saved search as a feed. Every item is sanitized
 * by the parser before it gets anywhere near storage or a model.
 */
export class RssAdapter implements SourceAdapter {
  readonly source = "rss" as const;

  constructor(
    private readonly feeds: FeedConfig[],
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async fetchNew(): Promise<AdapterResult> {
    if (this.feeds.length === 0) return { status: "skipped", detail: "no feeds configured" };

    const items: RawSignal[] = [];
    let failures = 0;
    for (const feed of this.feeds.slice(0, 10)) {
      try {
        const response = await this.fetchFn(feed.url, {
          headers: {
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          failures += 1;
          continue;
        }
        const xml = (await response.text()).slice(0, MAX_BYTES);
        for (const item of parseFeed(xml)) {
          const ref = createHash("sha256").update(`${feed.url}#${item.ref}`).digest("hex");
          items.push({
            source: "rss",
            sourceRef: ref,
            title: item.title,
            summary: item.summary,
            url: item.url,
            publishedAt: item.publishedAt,
            companyCvr: null,
            payload: { feed: feed.url, label: feed.label ?? null, ref: item.ref },
          });
        }
      } catch {
        failures += 1;
      }
    }
    if (items.length === 0 && failures > 0) {
      return { status: "unavailable", detail: `${failures} feed(s) failed` };
    }
    return { status: "ok", items };
  }
}
