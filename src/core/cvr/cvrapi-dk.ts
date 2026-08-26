import type { CvrCompany, CvrLookupResult, CvrProvider } from "./types";

type FetchLike = typeof fetch;

type CvrapiResponse = {
  error?: string;
  vat?: number;
  name?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  phone?: string;
  email?: string;
  industrycode?: number;
  industrydesc?: string;
  companydesc?: string;
};

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Provider for the free https://cvrapi.dk service.
 *
 * Their terms require an identifying User-Agent, and the free tier is
 * quota-limited per IP (QUOTA_EXCEEDED once exhausted). Quota and network
 * problems are reported as "unavailable" — never as "not found" — so the
 * UI can fall back to manual entry without claiming the CVR doesn't exist.
 */
export class CvrapiDkProvider implements CvrProvider {
  readonly id = "cvrapi.dk";

  constructor(
    private readonly userAgent: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async lookup(cvr: string): Promise<CvrLookupResult> {
    let response: Response;
    try {
      response = await this.fetchFn(
        `https://cvrapi.dk/api?search=${encodeURIComponent(cvr)}&country=dk`,
        {
          headers: { "User-Agent": this.userAgent },
          signal: AbortSignal.timeout(8000),
        },
      );
    } catch {
      return { status: "unavailable" };
    }

    let payload: CvrapiResponse;
    try {
      payload = (await response.json()) as CvrapiResponse;
    } catch {
      return { status: "unavailable" };
    }

    if (payload.error) {
      return payload.error === "NOT_FOUND" ? { status: "not_found" } : { status: "unavailable" };
    }
    if (!response.ok || !payload.name || payload.vat === undefined) {
      return response.status === 404 ? { status: "not_found" } : { status: "unavailable" };
    }

    const company: CvrCompany = {
      cvr: String(payload.vat).padStart(8, "0"),
      name: String(payload.name),
      address: asText(payload.address),
      zipcode: asText(payload.zipcode),
      city: asText(payload.city),
      phone: asText(payload.phone),
      email: asText(payload.email),
      industryCode: asText(payload.industrycode),
      industryText: asText(payload.industrydesc),
      companyType: asText(payload.companydesc),
      raw: payload,
    };
    return { status: "found", company };
  }
}
