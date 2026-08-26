import { ManualAccountingProvider } from "./manual";
import type { AccountingProvider } from "./types";

export type { AccountingInvoicePayload, AccountingProvider, AccountingPushResult } from "./types";

/**
 * Provider registry. Dinero is the first integration target (ADR 0004);
 * it slots in here behind ACCOUNTING_PROVIDER=dinero once the OAuth and
 * API mapping land — nothing in the invoicing module changes.
 */
export function getAccountingProvider(): AccountingProvider {
  return new ManualAccountingProvider();
}
