import { cn } from "@/lib/utils";

/**
 * The 2a page opening: an optional kicker over a 33px title, a supporting
 * line, and the page's actions on the right.
 */
function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  size = "page",
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "page" | "detail" | "section";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {kicker ? (
          <p className="text-chart-2 text-[0.78rem] leading-none font-medium">{kicker}</p>
        ) : null}
        <h1
          className={cn(
            "leading-[1.1] font-semibold tracking-[-0.02em]",
            size === "page" && "text-[2.0625rem]",
            size === "detail" && "text-[1.8125rem]",
            size === "section" && "text-[1.625rem]",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground text-[0.906rem] leading-normal">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { PageHeader };
