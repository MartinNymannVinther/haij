/**
 * CVR lookup abstraction. The provider behind it is replaceable (ADR/plan:
 * start with the public cvrapi.dk, switch to official Virk system-to-system
 * access later without touching callers).
 */

export type CvrCompany = {
  cvr: string;
  name: string;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  industryCode: string | null;
  industryText: string | null;
  companyType: string | null;
  /** Raw provider payload, stored as a snapshot on the company. */
  raw: unknown;
};

export type CvrLookupResult =
  | { status: "found"; company: CvrCompany }
  | { status: "not_found" }
  /** Provider quota hit, network error or provider disabled. */
  | { status: "unavailable" };

export interface CvrProvider {
  readonly id: string;
  lookup(cvr: string): Promise<CvrLookupResult>;
}
