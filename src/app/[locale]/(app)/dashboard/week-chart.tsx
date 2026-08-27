import { cn } from "@/lib/utils";

export type WeekDay = {
  iso: string;
  label: string;
  billableMinutes: number;
  internalMinutes: number;
  isToday: boolean;
  isFuture: boolean;
};

/**
 * The week so far: one column per day, billable minutes in primary over
 * internal minutes in the neutral chart tone. Pure CSS bars - no chart
 * library, and no dependency added for seven rectangles.
 */
export function WeekChart({ days }: { days: WeekDay[] }) {
  const peak = Math.max(60, ...days.map((day) => day.billableMinutes + day.internalMinutes));

  return (
    <div className="flex items-end gap-2" style={{ height: "150px" }}>
      {days.map((day) => {
        const total = day.billableMinutes + day.internalMinutes;
        return (
          <div key={day.iso} className="flex h-full flex-1 flex-col justify-end gap-2">
            <div className="flex w-full flex-col justify-end" style={{ height: "126px" }}>
              {total === 0 ? (
                <div className="bg-hairline h-[3px] w-full rounded-full" />
              ) : (
                <div className="flex w-full flex-col overflow-hidden rounded-t-md">
                  <div
                    className={cn("w-full", day.isToday ? "bg-chart-2" : "bg-primary")}
                    style={{ height: `${(day.billableMinutes / peak) * 126}px` }}
                  />
                  <div
                    className="bg-chart-5 w-full"
                    style={{ height: `${(day.internalMinutes / peak) * 126}px` }}
                  />
                </div>
              )}
            </div>
            <span
              className={cn(
                "text-center text-[0.72rem] lowercase",
                day.isToday ? "text-foreground font-semibold" : "text-label",
              )}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
