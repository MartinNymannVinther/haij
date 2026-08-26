import { env } from "@/core/env";
import { CvrapiDkProvider } from "./cvrapi-dk";
import type { CvrProvider } from "./types";

export type { CvrCompany, CvrLookupResult, CvrProvider } from "./types";
export { normalizeCvr } from "./validate";

let provider: CvrProvider | null | undefined;

/** The configured CVR provider, or null when lookups are disabled. */
export function getCvrProvider(): CvrProvider | null {
  if (provider !== undefined) return provider;
  if (env.CVR_PROVIDER === "none") {
    provider = null;
    return provider;
  }
  // cvrapi.dk's terms require an identifying User-Agent with a contact.
  const contact = env.CVR_CONTACT ?? env.BETTER_AUTH_URL;
  provider = new CvrapiDkProvider(`Haij (https://haij.dk) - ${contact}`);
  return provider;
}
