import type { CvrCompany, CvrLookupResult, CvrProvider } from "./types";

type FetchLike = typeof fetch;

type VirkAddress = {
  conavn?: string | null;
  vejnavn?: string | null;
  husnummerFra?: number | null;
  husnummerTil?: number | null;
  bogstavFra?: string | null;
  bogstavTil?: string | null;
  etage?: string | null;
  sidedoer?: string | null;
  postnummer?: number | null;
  postdistrikt?: string | null;
};

type VirkMetadata = {
  nyesteNavn?: { navn?: string | null } | null;
  nyesteBeliggenhedsadresse?: VirkAddress | null;
  nyesteHovedbranche?: {
    branchekode?: number | string | null;
    branchetekst?: string | null;
  } | null;
  nyesteVirksomhedsform?: {
    kortBeskrivelse?: string | null;
    langBeskrivelse?: string | null;
  } | null;
  nyesteKontaktoplysninger?: string[] | null;
};

type VirkSearchResponse = {
  hits?: {
    total?: number | { value?: number };
    hits?: Array<{
      _source?: {
        Vrvirksomhed?: {
          cvrNummer?: number;
          virksomhedMetadata?: VirkMetadata;
        };
      };
    }>;
  };
};

/** "Langelinie Allé 17, 2. th" from the structured address parts. */
export function composeVirkAddress(address: VirkAddress | null | undefined): string | null {
  if (!address) return null;
  const number = [
    address.husnummerFra != null ? String(address.husnummerFra) : null,
    address.bogstavFra ?? null,
  ]
    .filter(Boolean)
    .join("");
  const numberTo = [
    address.husnummerTil != null ? String(address.husnummerTil) : null,
    address.bogstavTil ?? null,
  ]
    .filter(Boolean)
    .join("");
  const street = [address.vejnavn, numberTo ? `${number}-${numberTo}` : number || null]
    .filter(Boolean)
    .join(" ");
  const floor = [address.etage ? `${address.etage}.` : null, address.sidedoer ?? null]
    .filter(Boolean)
    .join(" ");
  const line = [street || null, floor || null].filter(Boolean).join(", ");
  const withCo = address.conavn ? [`c/o ${address.conavn}`, line || null] : [line || null];
  const result = withCo.filter(Boolean).join(", ");
  return result.length > 0 ? result : null;
}

function pickContact(entries: string[] | null | undefined): {
  phone: string | null;
  email: string | null;
  website: string | null;
} {
  let phone: string | null = null;
  let email: string | null = null;
  let website: string | null = null;
  for (const raw of entries ?? []) {
    const value = raw.trim();
    if (!value) continue;
    if (!email && value.includes("@")) email = value;
    else if (!website && /^(www\.|https?:\/\/)/i.test(value)) website = value;
    else if (!phone && /^[+\d][\d\s-]{6,}$/.test(value)) phone = value;
  }
  return { phone, email, website };
}

/**
 * Provider for Erhvervsstyrelsen's official CVR system-to-system access
 * (distribution.virk.dk, Elasticsearch interface, HTTP Basic Auth).
 *
 * The query asks only for `virksomhedMetadata` — the register's own "newest
 * values" projection — so responses and the stored snapshot stay small
 * instead of carrying the company's full history.
 */
export class VirkCvrProvider implements CvrProvider {
  readonly id = "virk";

  constructor(
    private readonly user: string,
    private readonly password: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async lookup(cvr: string): Promise<CvrLookupResult> {
    let response: Response;
    try {
      // Typeless endpoint: works on current clusters where the old
      // /cvr-permanent/virksomhed/_search type path is rejected. The term
      // query only matches company documents anyway.
      response = await this.fetchFn("https://distribution.virk.dk/cvr-permanent/_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString("base64")}`,
        },
        body: JSON.stringify({
          query: { term: { "Vrvirksomhed.cvrNummer": Number(cvr) } },
          size: 1,
          _source: ["Vrvirksomhed.cvrNummer", "Vrvirksomhed.virksomhedMetadata"],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error(
        "cvr: virk lookup network error:",
        error instanceof Error ? error.message : error,
      );
      return { status: "unavailable" };
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.error(`cvr: virk rejected the credentials (HTTP ${response.status})`);
      } else {
        const snippet = (await response.text().catch(() => "")).slice(0, 200);
        console.error(`cvr: virk lookup failed (HTTP ${response.status}): ${snippet}`);
      }
      return { status: "unavailable" };
    }

    let payload: VirkSearchResponse;
    try {
      payload = (await payloadJson(response)) as VirkSearchResponse;
    } catch {
      return { status: "unavailable" };
    }

    const hit = payload.hits?.hits?.[0];
    if (!hit) return { status: "not_found" };

    const source = hit._source?.Vrvirksomhed;
    const metadata = source?.virksomhedMetadata;
    const name = metadata?.nyesteNavn?.navn?.trim();
    if (!source || !name) return { status: "unavailable" };

    const address = metadata?.nyesteBeliggenhedsadresse;
    const contact = pickContact(metadata?.nyesteKontaktoplysninger);

    const company: CvrCompany = {
      cvr: String(source.cvrNummer ?? cvr).padStart(8, "0"),
      name,
      address: composeVirkAddress(address),
      zipcode: address?.postnummer != null ? String(address.postnummer) : null,
      city: address?.postdistrikt ?? null,
      phone: contact.phone,
      email: contact.email,
      website: contact.website,
      industryCode:
        metadata?.nyesteHovedbranche?.branchekode != null
          ? String(metadata.nyesteHovedbranche.branchekode)
          : null,
      industryText: metadata?.nyesteHovedbranche?.branchetekst ?? null,
      companyType:
        metadata?.nyesteVirksomhedsform?.langBeskrivelse ??
        metadata?.nyesteVirksomhedsform?.kortBeskrivelse ??
        null,
      raw: hit._source,
    };
    return { status: "found", company };
  }
}

async function payloadJson(response: Response): Promise<unknown> {
  return response.json();
}
