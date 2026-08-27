import type { PipelineStage } from "@/core/db/schema";

export const STAGE_ORDER: PipelineStage[] = ["lead", "dialogue", "proposal", "won", "lost"];

/** Badge styling per stage, built purely from theme tokens. */
export const STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  lead: "bg-muted text-secondary-foreground",
  dialogue: "bg-secondary text-secondary-foreground",
  proposal: "bg-warning-tint text-warning",
  won: "bg-accent text-accent-foreground",
  lost: "border-border bg-transparent text-meta",
};

/** Accent bar/dot color per stage for the pipeline board. */
export const STAGE_ACCENT_CLASS: Record<PipelineStage, string> = {
  lead: "bg-chart-3",
  dialogue: "bg-chart-2",
  proposal: "bg-chart-4",
  won: "bg-primary",
  lost: "bg-label",
};
