import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared empty state: a calm, centered panel with an icon tile, a title and
 * an optional hint and action. `variant="panel"` renders the framed dashed
 * surface used in place of a card; `variant="inline"` sits inside existing
 * card content.
 */
function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  variant = "panel",
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "panel" | "inline";
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 px-6 text-center",
        variant === "panel" ? "border-border rounded-xl border border-dashed py-14" : "py-10",
        className,
      )}
    >
      <div className="bg-card text-muted-foreground shadow-[var(--surface-shadow)] ring-foreground/10 flex size-11 items-center justify-center rounded-xl ring-1">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-muted-foreground text-sm text-pretty">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export { EmptyState };
