import type { ContactCategory } from "@/core/db/schema";

/**
 * Display order and tint for the contact categories. Kept beside the CRM
 * module rather than in each view, so the badge on a customer page, the
 * filter on the contacts page and the picker in the form always agree.
 *
 * Order is by how often you act on them, not alphabetically: the two that
 * decide whether an assignment happens come first.
 */
export const CONTACT_CATEGORY_ORDER: readonly ContactCategory[] = [
  "decision_maker",
  "practitioner",
  "door_opener",
  "thought_leader",
  "partner",
  "former_colleague",
  "press",
];

export const CONTACT_CATEGORY_CLASS: Record<ContactCategory, string> = {
  decision_maker: "bg-accent text-accent-foreground border-transparent",
  practitioner: "bg-secondary text-secondary-foreground border-transparent",
  door_opener: "bg-success-tint text-success border-transparent",
  thought_leader: "bg-warning-tint text-warning border-transparent",
  partner: "bg-secondary text-secondary-foreground border-transparent",
  former_colleague: "bg-muted text-meta border-transparent",
  press: "bg-muted text-meta border-transparent",
};
