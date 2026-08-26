import type { InvoiceStatus } from "@/core/db/schema";

/** Badge styling per invoice status, built purely from theme tokens. */
export const INVOICE_STATUS_BADGE_CLASS: Record<InvoiceStatus, string> = {
  draft: "border-border bg-transparent text-muted-foreground",
  issued: "border-transparent bg-primary/15 text-primary",
  sent: "border-transparent bg-secondary text-secondary-foreground",
  paid: "border-transparent bg-primary text-primary-foreground",
};
