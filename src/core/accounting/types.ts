/**
 * Accounting adapter boundary. Haij never keeps its own ledger
 * (CLAUDE.md): bookkeeping lives in a registered Danish system, reached
 * through this interface. The payload is shaped so the Dinero provider
 * (the first real target) can map it 1:1 to their create-invoice API;
 * e-conomic fits the same shape.
 */

export type AccountingInvoicePayload = {
  invoiceId: string;
  type: "invoice" | "credit_note";
  invoiceNumber: number;
  invoiceDate: string; // yyyy-mm-dd
  dueDate: string | null;
  currency: string;
  buyer: {
    name: string;
    cvr: string | null;
    address: string | null;
    zipcode: string | null;
    city: string | null;
    eanGln: string | null;
  };
  lines: Array<{
    description: string;
    quantityHundredths: number;
    unit: string;
    unitPriceOere: number;
    vatRateBp: number;
    lineNetOere: number;
  }>;
  netOere: number;
  vatOere: number;
  grossOere: number;
};

export type AccountingPushResult =
  /** Recorded in the external system; externalId is its reference there. */
  | { status: "pushed"; externalId: string }
  /** No integration active — the user records the invoice manually. */
  | { status: "manual" }
  | { status: "failed"; message: string };

export interface AccountingProvider {
  /** Stable identifier, e.g. "manual" or "dinero". */
  readonly id: string;
  /** Human-readable name for the settings UI. */
  readonly label: string;
  /** Push an issued invoice (or credit note) to the bookkeeping system. */
  pushInvoice(payload: AccountingInvoicePayload): Promise<AccountingPushResult>;
}
