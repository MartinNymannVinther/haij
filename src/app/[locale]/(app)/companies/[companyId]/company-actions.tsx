"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { deleteCompanyAction, updateCompanyAction } from "@/modules/crm/actions";
import { useRouter } from "@/i18n/navigation";
import { CompanyFields, type CompanyFormValues } from "../company-fields";

export function CompanyActions({
  companyId,
  companyName,
  initialValues,
}: {
  companyId: string;
  companyName: string;
  initialValues: CompanyFormValues;
}) {
  const t = useTranslations("crm.detail");
  const tCreate = useTranslations("crm.create");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [values, setValues] = useState<CompanyFormValues>(initialValues);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await updateCompanyAction(companyId, values);
    setPending(false);
    if (!result.ok) {
      setError(result.error === "cvrExists" ? tCreate("cvrExists") : tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    setEditOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setPending(true);
    const result = await deleteCompanyAction(companyId);
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("deletedToast"));
    router.push("/companies");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil data-slot="icon" />
        {t("edit")}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("delete")}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="text-destructive" />
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSave}
            className="flex max-h-[70svh] flex-col gap-4 overflow-y-auto pr-1"
          >
            <CompanyFields values={values} onChange={setValues} idPrefix="edit" />
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending || values.name.trim().length === 0}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: companyName })}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
