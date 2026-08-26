import type { PipelineStage } from "@/core/db/schema";

export const STAGE_ORDER: PipelineStage[] = ["lead", "dialogue", "proposal", "won", "lost"];

/** Badge styling per stage, built purely from theme tokens. */
export const STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  lead: "border-border bg-transparent text-muted-foreground",
  dialogue: "border-transparent bg-secondary text-secondary-foreground",
  proposal: "border-transparent bg-primary/15 text-primary",
  won: "border-transparent bg-primary text-primary-foreground",
  lost: "border-transparent bg-destructive/10 text-destructive",
};
