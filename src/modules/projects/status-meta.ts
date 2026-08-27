import type { ProjectStatus } from "@/core/db/schema";

/** Chip styling per project status: 2a tint plus ink. */
export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  active: "bg-success-tint text-success",
  done: "bg-accent text-accent-foreground",
  archived: "border-border bg-transparent text-meta",
};
