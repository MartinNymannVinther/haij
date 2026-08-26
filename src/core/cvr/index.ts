import { env } from "@/core/env";
import { CvrapiDkProvider } from "./cvrapi-dk";
import type { CvrProvider } from "./types";
import { VirkCvrProvider } from "./virk";

export type { CvrCompany, CvrLookupResult, CvrProvider } from "./types";
export { normalizeCvr } from "./validate";

let provider: CvrProvider | null | undefined;

/** The configured CVR provider, or null when lookups are disabled. */
export function getCvrProvider(): CvrProvider | null {
  if (provider !== undefined) return provider;
  switch (env.CVR_PROVIDER) {
    case "none":
      provider = null;
      break;
    case "virk":
      // Presence of the credentials is enforced by the env schema.
      provider = new VirkCvrProvider(env.VIRK_CVR_USER!, env.VIRK_CVR_PASSWORD!);
      break;
    case "cvrapi": {
      // cvrapi.dk's terms require an identifying User-Agent with a contact.
      const contact = env.CVR_CONTACT ?? env.BETTER_AUTH_URL;
      provider = new CvrapiDkProvider(`Haij (https://haij.dk) - ${contact}`);
      break;
    }
  }
  return provider ?? null;
}
