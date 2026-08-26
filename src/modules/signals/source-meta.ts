import type { SignalSource } from "@/core/db/schema";

/** Badge styling per source, purely from theme tokens. */
export const SOURCE_BADGE_CLASS: Record<SignalSource, string> = {
  cvr: "border-transparent bg-primary/15 text-primary",
  ted: "border-transparent bg-secondary text-secondary-foreground",
  rss: "border-border bg-transparent text-muted-foreground",
  manual: "border-border bg-transparent text-muted-foreground",
};

export function scoreBadgeClass(score: number): string {
  if (score >= 70) return "border-transparent bg-primary text-primary-foreground";
  if (score >= 40) return "border-transparent bg-primary/15 text-primary";
  return "border-border bg-transparent text-muted-foreground";
}
