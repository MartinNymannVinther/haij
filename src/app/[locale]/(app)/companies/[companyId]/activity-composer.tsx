"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addActivityAction } from "@/modules/crm/actions";
import { useRouter } from "@/i18n/navigation";

const TYPES = ["note", "call", "meeting", "email"] as const;
type ComposerType = (typeof TYPES)[number];

const TYPE_KEY: Record<ComposerType, "typeNote" | "typeCall" | "typeMeeting" | "typeEmail"> = {
  note: "typeNote",
  call: "typeCall",
  meeting: "typeMeeting",
  email: "typeEmail",
};

export function ActivityComposer({ companyId }: { companyId: string }) {
  const t = useTranslations("crm.timeline");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [type, setType] = useState<ComposerType>("note");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const items = TYPES.map((value) => ({ value, label: t(TYPE_KEY[value]) }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length === 0) return;
    setPending(true);
    const result = await addActivityAction({ companyId, type, body });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    setBody("");
    toast.success(t("addedToast"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("placeholder")}
        rows={3}
        maxLength={5000}
      />
      <div className="flex items-center justify-between gap-2">
        <Select items={items} value={type} onValueChange={(v) => setType(v as ComposerType)}>
          <SelectTrigger size="sm" className="w-32">
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
        <Button type="submit" size="sm" disabled={pending || body.trim().length === 0}>
          {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
