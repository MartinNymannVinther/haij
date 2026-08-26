import { cn } from "@/lib/utils";

/**
 * The Haij wordmark: tight lowercase type with the full stop in the accent
 * color. Text-based so it inherits the current foreground and scales with
 * font-size utilities.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline font-semibold tracking-tight", className)}>
      haij
      <span aria-hidden className="text-primary">
        .
      </span>
    </span>
  );
}
