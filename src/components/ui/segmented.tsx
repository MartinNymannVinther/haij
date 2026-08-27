import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Href = React.ComponentProps<typeof Link>["href"];

/**
 * The 2a segmented filter: one track on the secondary ground where the active
 * segment lifts onto the card color. Server friendly - every segment is a link.
 */
function SegmentedFilter({
  items,
  className,
}: {
  items: Array<{ key: string; label: React.ReactNode; href: Href; active: boolean }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-secondary border-border inline-flex shrink-0 items-center gap-0.5 rounded-md border p-1",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={cn(
            "rounded-sm px-3 py-1.5 text-[0.8125rem] whitespace-nowrap transition-colors duration-[120ms] ease-out",
            item.active
              ? "bg-card text-foreground shadow-[var(--surface-shadow)] font-semibold"
              : "text-meta hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export { SegmentedFilter };
