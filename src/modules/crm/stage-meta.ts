import type { PipelineStage } from "@/core/db/schema";

export const STAGE_ORDER: PipelineStage[] = ["lead", "dialogue", "proposal", "won", "lost"];

/** Badge styling per stage, built purely from theme tokens. */
export const STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  lead: "border-border bg-transparent text-muted-foreground",
  dialogue: "border-transparent bg-primary/12 text-primary dark:bg-primary/20",
  proposal: "border-transparent bg-warning/15 text-warning dark:bg-warning/20",
  won: "border-transparent bg-success text-success-foreground",
  lost: "border-transparent bg-destructive/10 text-destructive",
};

/** Accent bar/dot color per stage for the pipeline board. */
export const STAGE_ACCENT_CLASS: Record<PipelineStage, string> = {
  lead: "bg-muted-foreground/40",
  dialogue: "bg-primary",
  proposal: "bg-warning",
  won: "bg-success",
  lost: "bg-destructive",
};
