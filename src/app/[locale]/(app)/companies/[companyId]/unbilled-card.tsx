import { getTranslations } from "next-intl/server";
import { formatOere } from "@/modules/invoicing/money";
import { formatMinutes } from "@/modules/time/duration";

/**
 * The 2a action card: unbilled time stated as one number with the action that
 * clears it. Full width above the detail columns, so the thing to do next is
 * the first thing on the customer page.
 */
export async function UnbilledCard({
  minutes,
  valueOere,
  action,
}: {
  minutes: number;
  valueOere: number;
  action: React.ReactNode;
}) {
  const t = await getTranslations("economy.customerCard");

  return (
    <section className="bg-accent flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-[oklch(0.885_0.025_150)] px-6 py-[22px]">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-accent-foreground/75 text-[0.78rem] font-medium">{t("unbilledLabel")}</p>
        <p className="text-accent-foreground text-[1.6875rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatMinutes(minutes)} · {formatOere(valueOere)}
        </p>
        <p className="text-accent-foreground/75 text-[0.78rem]">{t("unbilledHint")}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </section>
  );
}
