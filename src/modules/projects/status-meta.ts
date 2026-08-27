import type { ProjectStatus } from "@/core/db/schema";

/** Badge styling per project status, built purely from theme tokens. */
export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  active: "border-transparent bg-primary/12 text-primary dark:bg-primary/20",
  done: "border-transparent bg-success text-success-foreground",
  archived: "border-border bg-transparent text-muted-foreground",
};
