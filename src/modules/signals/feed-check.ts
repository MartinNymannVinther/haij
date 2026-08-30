import { parseFeed } from "@/core/ingest/rss";

/**
 * Checks one feed the way the ingestion actually reads it: same headers,
 * same timeout, same size cap, same parser. A check that used a friendlier
 * path would tell you the feed is fine and then leave you wondering why
 * nothing ever arrives.
 *
 * The reply carries only counts and one sanitized title. Feed content is
 * untrusted input, so nothing here becomes an instruction and nothing
 * reaches a model.
 */

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

export type FeedCheck =
  | { status: "ok"; items: number; newestTitle: string | null }
  | { status: "empty" }
  | { status: "not_feed" }
  | { status: "http"; code: number }
  | { status: "unreachable" };

export async function checkFeed(url: string, fetchFn: typeof fetch = fetch): Promise<FeedCheck> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "unreachable" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { status: "unreachable" };
  }

  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: "unreachable" };
  }
  if (!response.ok) return { status: "http", code: response.status };

  const xml = (await response.text()).slice(0, MAX_BYTES);
  // A site that answers with its own HTML page instead of a feed is the
  // most common mistake, and it looks like success until you parse it.
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return { status: "not_feed" };

  const items = parseFeed(xml);
  if (items.length === 0) return { status: "empty" };
  return { status: "ok", items: items.length, newestTitle: items[0]?.title ?? null };
}
