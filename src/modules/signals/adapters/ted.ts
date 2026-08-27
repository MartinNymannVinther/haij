import { sanitizeText } from "@/core/ingest/sanitize";
import type { AdapterResult, RawSignal, SourceAdapter } from "./types";

type FetchLike = typeof fetch;

type TedNotice = {
  "publication-number"?: string;
  "publication-date"?: string;
  "notice-title"?: Record<string, string>;
  "buyer-name"?: Record<string, string[]>;
  links?: { html?: Record<string, string> };
};

type TedResponse = { notices?: TedNotice[] };

/** TED writes dates as "2026-08-25+02:00"; fall back to the date part. */
function parseTedDate(value: string | undefined): Date | null {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const dateOnly = new Date(value.slice(0, 10));
  return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
}

/**
 * EU tenders via TED's open search API (no key required). Denmark as
 * place of performance plus the org's keywords in full text. udbud.dk
 * has no public API; Danish tenders above threshold all reach TED, and
 * the adapter interface leaves room for a dedicated udbud.dk source
 * later. Verified live 2026-08-26.
 */
export class TedAdapter implements SourceAdapter {
  readonly source = "ted" as const;

  constructor(
    private readonly keywords: string[],
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async fetchNew(): Promise<AdapterResult> {
    const terms = this.keywords.map((k) => k.trim()).filter(Boolean);
    if (terms.length === 0) return { status: "skipped", detail: "no keywords configured" };

    const ftClause = terms.map((t) => `"${t.replace(/["\\]/g, "")}"`).join(" OR ");
    const query = `(place-of-performance IN (DNK)) AND (FT ~ (${ftClause})) SORT BY publication-number DESC`;

    let response: Response;
    try {
      response = await this.fetchFn("https://api.ted.europa.eu/v3/notices/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          fields: ["publication-number", "publication-date", "notice-title", "buyer-name", "links"],
          limit: 20,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { status: "unavailable", detail: "api.ted.europa.eu did not answer" };
    }
    if (!response.ok) {
      return { status: "unavailable", detail: `HTTP ${response.status}` };
    }

    let payload: TedResponse;
    try {
      payload = (await response.json()) as TedResponse;
    } catch {
      return { status: "unavailable", detail: "malformed response" };
    }

    const items: RawSignal[] = [];
    for (const notice of payload.notices ?? []) {
      const ref = notice["publication-number"];
      const title = sanitizeText(
        notice["notice-title"]?.dan ?? notice["notice-title"]?.eng ?? null,
        300,
      );
      if (!ref || !title) continue;
      const buyers =
        notice["buyer-name"]?.dan ?? Object.values(notice["buyer-name"] ?? {})[0] ?? [];
      const buyerLine = sanitizeText(buyers.join(", "), 300);
      items.push({
        source: "ted",
        sourceRef: ref,
        title,
        summary: buyerLine ? `Ordregiver: ${buyerLine}` : null,
        url: notice.links?.html?.DAN ?? notice.links?.html?.ENG ?? null,
        publishedAt: parseTedDate(notice["publication-date"]),
        companyCvr: null,
        payload: notice,
      });
    }
    return { status: "ok", items };
  }
}
