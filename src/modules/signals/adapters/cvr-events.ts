import { sanitizeText } from "@/core/ingest/sanitize";
import { composeVirkAddress } from "@/core/cvr/virk";
import type { AdapterResult, RawSignal, SourceAdapter } from "./types";

type FetchLike = typeof fetch;

type VirkHit = {
  _source?: {
    Vrvirksomhed?: {
      cvrNummer?: number;
      sidstOpdateret?: string;
      virksomhedMetadata?: {
        nyesteNavn?: { navn?: string | null } | null;
        nyesteHovedbranche?: {
          branchekode?: number | string | null;
          branchetekst?: string | null;
        } | null;
        nyesteBeliggenhedsadresse?: Parameters<typeof composeVirkAddress>[0];
        sammensatStatus?: string | null;
        stiftelsesDato?: string | null;
      } | null;
    };
  };
};

type VirkResponse = { hits?: { hits?: VirkHit[] } };

/**
 * CVR events through the same official Virk access the CVR lookup uses:
 * recently updated companies whose main branch code falls under the
 * org's chosen prefixes (e.g. "62" for software, "7022" for management
 * consulting). A company appears once per org (dedupe on CVR) — the
 * point is the introduction, not a change feed.
 */
export class CvrEventsAdapter implements SourceAdapter {
  readonly source = "cvr" as const;

  constructor(
    private readonly branchePrefixes: string[],
    private readonly user: string | undefined,
    private readonly password: string | undefined,
    private readonly fetchFn: FetchLike = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fetchNew(): Promise<AdapterResult> {
    const prefixes = this.branchePrefixes
      .map((p) => p.trim())
      .filter((p) => /^\d{2,6}$/.test(p));
    if (prefixes.length === 0) return { status: "skipped", detail: "no branch prefixes" };
    if (!this.user || !this.password) {
      return { status: "unavailable", detail: "virk credentials are not configured" };
    }

    // A prefix covers the 6-digit range it starts: 62 -> 620000..629999.
    const ranges = prefixes.map((prefix) => {
      const lower = Number(prefix.padEnd(6, "0"));
      const upper = Number(prefix.padEnd(6, "9"));
      return {
        range: {
          "Vrvirksomhed.virksomhedMetadata.nyesteHovedbranche.branchekode": {
            gte: lower,
            lte: upper,
          },
        },
      };
    });
    const since = new Date(this.now().getTime() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    let response: Response;
    try {
      response = await this.fetchFn("http://distribution.virk.dk/cvr-permanent/_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString("base64")}`,
        },
        body: JSON.stringify({
          query: {
            bool: {
              must: [{ range: { "Vrvirksomhed.sidstOpdateret": { gte: since } } }],
              should: ranges,
              minimum_should_match: 1,
            },
          },
          sort: [{ "Vrvirksomhed.sidstOpdateret": { order: "desc" } }],
          size: 20,
          _source: [
            "Vrvirksomhed.cvrNummer",
            "Vrvirksomhed.sidstOpdateret",
            "Vrvirksomhed.virksomhedMetadata",
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { status: "unavailable", detail: "distribution.virk.dk did not answer" };
    }
    if (!response.ok) {
      return { status: "unavailable", detail: `HTTP ${response.status}` };
    }

    let payload: VirkResponse;
    try {
      payload = (await response.json()) as VirkResponse;
    } catch {
      return { status: "unavailable", detail: "malformed response" };
    }

    const items: RawSignal[] = [];
    for (const hit of payload.hits?.hits ?? []) {
      const company = hit._source?.Vrvirksomhed;
      const metadata = company?.virksomhedMetadata;
      const name = sanitizeText(metadata?.nyesteNavn?.navn, 200);
      if (!company?.cvrNummer || !name) continue;
      const cvr = String(company.cvrNummer).padStart(8, "0");
      const branche = sanitizeText(metadata?.nyesteHovedbranche?.branchetekst, 200);
      const address = sanitizeText(composeVirkAddress(metadata?.nyesteBeliggenhedsadresse), 200);
      const parts = [
        branche ? `Branche: ${branche}` : null,
        address ? `Adresse: ${address}` : null,
        metadata?.stiftelsesDato ? `Stiftet: ${metadata.stiftelsesDato}` : null,
        `Opdateret i CVR: ${company.sidstOpdateret?.slice(0, 10) ?? "ukendt"}`,
      ].filter(Boolean);
      items.push({
        source: "cvr",
        sourceRef: cvr,
        title: name,
        summary: parts.join(" · "),
        url: `https://datacvr.virk.dk/enhed/virksomhed/${cvr}`,
        publishedAt: company.sidstOpdateret ? new Date(company.sidstOpdateret) : null,
        companyCvr: cvr,
        payload: hit._source,
      });
    }
    return { status: "ok", items };
  }
}
