import { ArrowRight, FileText, Mail, Phone, Sparkles, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActivityType } from "@/core/db/schema";

export type TimelineEntry = {
  id: string;
  type: ActivityType;
  body: string | null;
  metadata: unknown;
  happenedAt: Date;
  createdByName: string | null;
};

const TYPE_ICON: Record<string, typeof FileText> = {
  note: FileText,
  call: Phone,
  meeting: Users,
  email: Mail,
  stage_change: ArrowRight,
  system: Sparkles,
};

export function TimelineItem({
  entry,
  formattedTime,
}: {
  entry: TimelineEntry;
  formattedTime: string;
}) {
  const t = useTranslations("crm.timeline");
  const tStages = useTranslations("crm.stages");
  const Icon = TYPE_ICON[entry.type] ?? FileText;
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;

  let headline: string | null = null;
  if (entry.type === "stage_change") {
    const from = String(metadata.from ?? "lead");
    const to = String(metadata.to ?? "lead");
    headline = t("stageChanged", {
      from: tStages(from as never),
      to: tStages(to as never),
    });
  } else if (entry.type === "system") {
    if (metadata.event === "invoice_issued" || metadata.event === "credit_note_issued") {
      headline = t(metadata.event === "invoice_issued" ? "invoiceIssued" : "creditNoteIssued", {
        number: Number(metadata.invoiceNumber ?? 0),
      });
    } else {
      headline = metadata.source === "cvr" ? t("createdCvr") : t("createdManual");
    }
  } else {
    headline = t(
      entry.type === "note"
        ? "typeNote"
        : entry.type === "call"
          ? "typeCall"
          : entry.type === "meeting"
            ? "typeMeeting"
            : "typeEmail",
    );
  }

  return (
    <li className="flex gap-3">
      <div className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">
          {headline}
          {entry.createdByName ? ` · ${entry.createdByName}` : ""} · {formattedTime}
        </p>
        {entry.body ? <p className="mt-0.5 text-sm whitespace-pre-wrap">{entry.body}</p> : null}
      </div>
    </li>
  );
}
