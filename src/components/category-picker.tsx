"use client";

import { useTranslations } from "next-intl";
import type { ContactCategory } from "@/core/db/schema";
import { CONTACT_CATEGORY_ORDER } from "@/modules/crm/contact-meta";
import { cn } from "@/lib/utils";

/**
 * Picking what a contact is to the business. A row of toggles rather than
 * a multi-select: there are seven of them, they all fit, and seeing the
 * whole vocabulary is what makes people use the same words.
 */
export function CategoryPicker({
  values,
  onChange,
  label,
}: {
  values: ContactCategory[];
  onChange: (values: ContactCategory[]) => void;
  label: string;
}) {
  const t = useTranslations("crm.categories");

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {CONTACT_CATEGORY_ORDER.map((category) => {
        const active = values.includes(category);
        return (
          <button
            key={category}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(
                active ? values.filter((value) => value !== category) : [...values, category],
              )
            }
            className={cn(
              "rounded-sm border px-2.5 py-1 text-[0.78rem] font-medium transition-colors duration-[120ms]",
              active
                ? "bg-accent text-accent-foreground border-transparent"
                : "border-input text-secondary-foreground hover:bg-muted",
            )}
          >
            {t(category)}
          </button>
        );
      })}
    </div>
  );
}
