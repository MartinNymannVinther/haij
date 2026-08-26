"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addManualSignalAction } from "@/modules/signals/actions";
import { useRouter } from "@/i18n/navigation";

export function AddSignalDialog() {
  const t = useTranslations("signals.add");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await addManualSignalAction({
      title: String(form.get("title") ?? ""),
      url: String(form.get("url") ?? "") || null,
      note: String(form.get("note") ?? ""),
      companyCvr: String(form.get("companyCvr") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error === "invalid" ? t("invalid") : tCommon("error"));
      return;
    }
    toast.success(t("addedToast"));
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus data-slot="icon" />
        {t("trigger")}
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="signal-title">{t("titleLabel")}</FieldLabel>
            <Input id="signal-title" name="title" required maxLength={300} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="signal-url">{t("urlLabel")}</FieldLabel>
            <Input id="signal-url" name="url" type="url" maxLength={1000} placeholder="https://…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="signal-note">{t("noteLabel")}</FieldLabel>
            <Textarea id="signal-note" name="note" rows={3} maxLength={2000} />
          </Field>
          <Field>
            <FieldLabel htmlFor="signal-cvr">{t("cvrLabel")}</FieldLabel>
            <Input
              id="signal-cvr"
              name="companyCvr"
              inputMode="numeric"
              maxLength={8}
              placeholder="12345678"
              className="max-w-40"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
