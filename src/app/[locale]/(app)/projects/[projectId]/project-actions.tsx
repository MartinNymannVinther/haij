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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectStatus } from "@/core/db/schema";
import {
  deleteProjectAction,
  setProjectStatusAction,
  updateProjectAction,
} from "@/modules/projects/actions";
import {
  oereToInputValue,
  parseKronerToOere,
  parseQuantityToHundredths,
} from "@/modules/invoicing/money";
import { useRouter } from "@/i18n/navigation";

type ProjectData = {
  id: string;
  name: string;
  status: string;
  companyId: string | null;
  description: string | null;
  deadline: string | null;
  budgetMinutes: number | null;
  budgetAmountOere: number | null;
  hourlyRateOere: number | null;
};

const STATUSES: ProjectStatus[] = ["active", "done", "archived"];

export function ProjectActions({
  project,
  companies,
}: {
  project: ProjectData;
  companies: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("projects.detail");
  const tCreate = useTranslations("projects.create");
  const tStatus = useTranslations("projects.status");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [companyId, setCompanyId] = useState<string>(project.companyId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status as ProjectStatus);

  const companyItems = [
    { value: "", label: tCreate("noCompany") },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];
  const statusItems = STATUSES.map((s) => ({ value: s, label: tStatus(s) }));

  async function handleStatus(next: ProjectStatus | null) {
    if (!next || next === status) return;
    const previous = status;
    setStatus(next);
    const result = await setProjectStatusAction(project.id, next);
    if (!result.ok) {
      setStatus(previous);
      toast.error(tCommon("error"));
      return;
    }
    router.refresh();
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hoursRaw = String(form.get("budgetHours") ?? "").trim();
    const amountRaw = String(form.get("budgetAmount") ?? "").trim();
    const rateRaw = String(form.get("hourlyRate") ?? "").trim();
    const hoursHundredths = hoursRaw ? parseQuantityToHundredths(hoursRaw) : null;
    const amountOere = amountRaw ? parseKronerToOere(amountRaw) : null;
    const rateOere = rateRaw ? parseKronerToOere(rateRaw) : null;
    if (
      (hoursRaw && (hoursHundredths === null || hoursHundredths <= 0)) ||
      (amountRaw && (amountOere === null || amountOere <= 0)) ||
      (rateRaw && (rateOere === null || rateOere < 0))
    ) {
      toast.error(tCreate("invalidFrames"));
      return;
    }
    setPending(true);
    const result = await updateProjectAction(project.id, {
      name: String(form.get("name") ?? ""),
      companyId: companyId || null,
      description: String(form.get("description") ?? ""),
      deadline: String(form.get("deadline") ?? "") || null,
      budgetMinutes: hoursHundredths != null ? Math.round((hoursHundredths * 60) / 100) : null,
      budgetAmountOere: amountOere,
      hourlyRateOere: rateOere,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("savedToast"));
    setEditOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setPending(true);
    const result = await deleteProjectAction(project.id);
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    toast.success(t("deletedToast"));
    router.push("/projects");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        items={statusItems}
        value={status}
        onValueChange={(v) => handleStatus(v as ProjectStatus)}
      >
        <SelectTrigger size="sm" aria-label={tStatus(status)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil data-slot="icon" />
        {tCommon("edit")}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={tCommon("delete")}
        className="text-destructive"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 />
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="edit-name">{tCreate("name")}</FieldLabel>
              <Input
                id="edit-name"
                name="name"
                required
                maxLength={200}
                defaultValue={project.name}
              />
            </Field>
            <Field>
              <FieldLabel>{tCreate("customer")}</FieldLabel>
              <Select
                items={companyItems}
                value={companyId}
                onValueChange={(v) => setCompanyId((v as string) ?? "")}
              >
                <SelectTrigger aria-label={tCreate("customer")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {companyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-description">{tCreate("description")}</FieldLabel>
              <Textarea
                id="edit-description"
                name="description"
                rows={2}
                maxLength={2000}
                defaultValue={project.description ?? ""}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="edit-deadline">{tCreate("deadline")}</FieldLabel>
                <Input
                  id="edit-deadline"
                  name="deadline"
                  type="date"
                  defaultValue={project.deadline ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-hourlyRate">{tCreate("hourlyRate")}</FieldLabel>
                <Input
                  id="edit-hourlyRate"
                  name="hourlyRate"
                  inputMode="decimal"
                  placeholder={tCreate("rateFallback")}
                  defaultValue={
                    project.hourlyRateOere != null ? oereToInputValue(project.hourlyRateOere) : ""
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-budgetHours">{tCreate("hourFrame")}</FieldLabel>
                <Input
                  id="edit-budgetHours"
                  name="budgetHours"
                  inputMode="decimal"
                  placeholder={tCreate("none")}
                  defaultValue={
                    project.budgetMinutes != null
                      ? String(Math.round((project.budgetMinutes / 60) * 100) / 100).replace(
                          ".",
                          ",",
                        )
                      : ""
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-budgetAmount">{tCreate("amountFrame")}</FieldLabel>
                <Input
                  id="edit-budgetAmount"
                  name="budgetAmount"
                  inputMode="decimal"
                  placeholder={tCreate("none")}
                  defaultValue={
                    project.budgetAmountOere != null
                      ? oereToInputValue(project.budgetAmountOere)
                      : ""
                  }
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
