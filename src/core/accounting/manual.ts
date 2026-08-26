import type { AccountingInvoicePayload, AccountingProvider, AccountingPushResult } from "./types";

/**
 * The no-integration provider: Haij is the invoice archive and the user
 * records the invoice in their bookkeeping system themselves. This keeps
 * the issuing flow identical whether or not an integration is active.
 */
export class ManualAccountingProvider implements AccountingProvider {
  readonly id = "manual";
  readonly label = "Manuel bogføring";

  async pushInvoice(payload: AccountingInvoicePayload): Promise<AccountingPushResult> {
    void payload;
    return { status: "manual" };
  }
}
