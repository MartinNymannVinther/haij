import type { SignalSource } from "@/core/db/schema";

/** Badge styling per source, purely from theme tokens. */
export const SOURCE_BADGE_CLASS: Record<SignalSource, string> = {
  cvr: "bg-muted text-secondary-foreground",
  ted: "bg-accent text-accent-foreground",
  rss: "bg-muted text-secondary-foreground",
  manual: "bg-muted text-secondary-foreground",
};

export function scoreBadgeClass(score: number): string {
  if (score >= 70) return "bg-accent text-accent-foreground";
  if (score >= 40) return "bg-success-tint text-success";
  return "border-border bg-transparent text-meta";
}
