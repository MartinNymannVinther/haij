import { cn } from "@/lib/utils";

export type YearBar = {
  month: number;
  label: string;
  realizedOere: number;
  targetOere: number | null;
  isCurrent: boolean;
  isFuture: boolean;
};

/**
 * Twelve months as paired bars: realized in primary beside the target in the
 * neutral tone. Future months show the target alone. Pure CSS, no chart
 * dependency for twenty-four rectangles.
 */
export function YearChart({ bars }: { bars: YearBar[] }) {
  const peak = Math.max(1, ...bars.map((bar) => Math.max(bar.realizedOere, bar.targetOere ?? 0)));
  const height = (value: number) => `${Math.max(value > 0 ? 2 : 0, (value / peak) * 140)}px`;

  return (
    <div className="flex items-end gap-2.5 overflow-x-auto pb-1">
      {bars.map((bar) => (
        <div key={bar.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-[140px] w-full items-end justify-center gap-[3px]">
            {!bar.isFuture ? (
              <div
                title={bar.label}
                className={cn("w-3.5 rounded-t-[5px]", bar.isCurrent ? "bg-chart-2" : "bg-primary")}
                style={{ height: height(bar.realizedOere) }}
              />
            ) : null}
            <div
              className={cn("w-3.5 rounded-t-[5px]", bar.isFuture ? "bg-muted" : "bg-chart-5")}
              style={{ height: height(bar.targetOere ?? 0) }}
            />
          </div>
          <span
            className={cn(
              "text-[0.7rem] lowercase",
              bar.isCurrent ? "text-foreground font-semibold" : "text-label",
            )}
          >
            {bar.label}
          </span>
        </div>
      ))}
    </div>
  );
}
