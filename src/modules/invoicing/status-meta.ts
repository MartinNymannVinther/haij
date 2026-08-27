import type { InvoiceStatus } from "@/core/db/schema";

/** Badge styling per invoice status, built purely from theme tokens. */
export const INVOICE_STATUS_BADGE_CLASS: Record<InvoiceStatus, string> = {
  draft: "border-border bg-transparent text-muted-foreground",
  issued: "border-transparent bg-primary/12 text-primary dark:bg-primary/20",
  sent: "border-transparent bg-warning/15 text-warning dark:bg-warning/20",
  paid: "border-transparent bg-success text-success-foreground",
};
