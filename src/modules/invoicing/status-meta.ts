import type { InvoiceStatus } from "@/core/db/schema";

/** Chip styling per invoice status: 2a tint plus ink, never a solid fill. */
export const INVOICE_STATUS_BADGE_CLASS: Record<InvoiceStatus, string> = {
  draft: "border-border bg-transparent text-meta",
  issued: "bg-secondary text-secondary-foreground",
  sent: "bg-success-tint text-success",
  paid: "bg-accent text-accent-foreground",
};
