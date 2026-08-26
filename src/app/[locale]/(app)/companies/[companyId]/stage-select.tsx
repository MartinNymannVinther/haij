"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PipelineStage } from "@/core/db/schema";
import { setPipelineStageAction } from "@/modules/crm/actions";
import { STAGE_ORDER } from "@/modules/crm/stage-meta";
import { useRouter } from "@/i18n/navigation";

export function StageSelect({
  companyId,
  stage,
  companyName,
  size = "default",
}: {
  companyId: string;
  stage: PipelineStage;
  companyName?: string;
  size?: "sm" | "default";
}) {
  const t = useTranslations("crm.stages");
  const tPipeline = useTranslations("crm.pipeline");
  const router = useRouter();
  const [value, setValue] = useState<PipelineStage>(stage);
  const items = STAGE_ORDER.map((s) => ({ value: s, label: t(s) }));

  async function handleChange(next: PipelineStage | null) {
    if (!next || next === value) return;
    const previous = value;
    setValue(next);
    const result = await setPipelineStageAction(companyId, next);
    if (!result.ok) {
      setValue(previous);
      toast.error(t(previous));
      return;
    }
    if (companyName) {
      toast.success(tPipeline("movedToast", { name: companyName, stage: t(next) }));
    }
    router.refresh();
  }

  return (
    <Select items={items} value={value} onValueChange={(v) => handleChange(v as PipelineStage)}>
      <SelectTrigger size={size} aria-label={t(value)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
