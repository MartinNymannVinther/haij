import type { ProjectStatus } from "@/core/db/schema";

/** Badge styling per project status, built purely from theme tokens. */
export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  active: "border-transparent bg-primary/15 text-primary",
  done: "border-transparent bg-primary text-primary-foreground",
  archived: "border-border bg-transparent text-muted-foreground",
};
