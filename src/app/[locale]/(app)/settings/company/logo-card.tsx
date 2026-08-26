"use client";

import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteLogoAction, saveLogoAction } from "@/modules/invoicing/actions";
import { useRouter } from "@/i18n/navigation";

const MAX_BYTES = 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg"] as const;

export function LogoCard({ logoDataUrl }: { logoDataUrl: string | null }) {
  const t = useTranslations("orgProfile.logo");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type as (typeof ACCEPTED)[number])) {
      toast.error(t("wrongType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("tooBig"));
      return;
    }

    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        resolve(result.split(",")[1] ?? null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!base64) {
      toast.error(tCommon("error"));
      return;
    }

    setPending(true);
    const result = await saveLogoAction({
      contentType: file.type as (typeof ACCEPTED)[number],
      base64,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    router.refresh();
  }

  async function handleDelete() {
    setPending(true);
    const result = await deleteLogoAction();
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("deletedToast"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="border-border bg-background flex h-20 w-40 items-center justify-center overflow-hidden rounded-lg border">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt={t("previewAlt")} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon className="text-muted-foreground size-6" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleFile}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
            {pending ? (
              <Loader2 data-slot="icon" className="animate-spin" />
            ) : (
              <Upload data-slot="icon" />
            )}
            {logoDataUrl ? t("replace") : t("upload")}
          </Button>
          {logoDataUrl ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("remove")}
              className="text-destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
