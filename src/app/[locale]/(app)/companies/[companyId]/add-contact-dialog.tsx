"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addContactAction } from "@/modules/crm/actions";
import { useRouter } from "@/i18n/navigation";

export function AddContactDialog({ companyId }: { companyId: string }) {
  const t = useTranslations("crm.contacts");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await addContactAction({
      companyId,
      name: String(form.get("name") ?? ""),
      title: String(form.get("title") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      isPrimary: form.get("isPrimary") === "on",
    });
    setPending(false);
    if (!result.ok) {
      setError(tCommon("error"));
      return;
    }
    toast.success(t("addedToast"));
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus data-slot="icon" />
        {t("add")}
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="contact-name">{t("name")}</FieldLabel>
              <Input id="contact-name" name="name" required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-title">{t("role")}</FieldLabel>
              <Input id="contact-title" name="title" maxLength={200} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="contact-email">{t("email")}</FieldLabel>
                <Input id="contact-email" name="email" type="email" maxLength={320} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-phone">{t("phone")}</FieldLabel>
                <Input id="contact-phone" name="phone" maxLength={30} />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="contact-primary"
                name="isPrimary"
                type="checkbox"
                className="accent-primary size-4"
              />
              <Label htmlFor="contact-primary">{t("primary")}</Label>
            </div>
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
