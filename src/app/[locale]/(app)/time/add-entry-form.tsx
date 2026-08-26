"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addTimeEntryAction } from "@/modules/time/actions";
import { useRouter } from "@/i18n/navigation";

const NONE = "none";

export type ProjectOption = {
  id: string;
  name: string;
  companyId: string | null;
  companyName: string | null;
};

export function AddEntryForm({
  defaultDate,
  companies,
  projects,
}: {
  defaultDate: string;
  companies: Array<{ id: string; name: string }>;
  projects: ProjectOption[];
}) {
  const t = useTranslations("time.add");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>(NONE);
  const [projectId, setProjectId] = useState<string>(NONE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyItems = [
    { value: NONE, label: t("noCompany") },
    ...companies.map((company) => ({ value: company.id, label: company.name })),
  ];
  const projectItems = [
    { value: NONE, label: t("noProject") },
    ...projects.map((project) => ({
      value: project.id,
      label: project.companyName ? `${project.name} · ${project.companyName}` : project.name,
    })),
  ];

  function handleProjectChange(next: string | null) {
    const value = next ?? NONE;
    setProjectId(value);
    // Picking a project preselects its customer; a manual choice wins.
    if (value !== NONE) {
      const project = projects.find((p) => p.id === value);
      if (project?.companyId) setCompanyId(project.companyId);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await addTimeEntryAction({
      companyId: companyId === NONE ? null : companyId,
      projectId: projectId === NONE ? null : projectId,
      entryDate: String(form.get("entryDate") ?? ""),
      duration: String(form.get("duration") ?? ""),
      note: String(form.get("note") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error === "invalidDuration" ? t("invalidDuration") : tCommon("error"));
      return;
    }
    formElement.reset();
    setCompanyId(NONE);
    setProjectId(NONE);
    toast.success(t("addedToast"));
    router.refresh();
  }

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[9.5rem_minmax(9rem,1fr)_minmax(9rem,1fr)_6.5rem_minmax(9rem,1.4fr)_auto]"
        >
          <Field>
            <FieldLabel htmlFor="entry-date">{t("date")}</FieldLabel>
            <Input
              id="entry-date"
              name="entryDate"
              type="date"
              defaultValue={defaultDate}
              required
            />
          </Field>
          <Field>
            <FieldLabel>{t("company")}</FieldLabel>
            <Select
              items={companyItems}
              value={companyId}
              onValueChange={(v) => setCompanyId(v ?? NONE)}
            >
              <SelectTrigger>
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
            <FieldLabel>{t("project")}</FieldLabel>
            <Select items={projectItems} value={projectId} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="entry-duration">{t("duration")}</FieldLabel>
            <Input
              id="entry-duration"
              name="duration"
              placeholder={t("durationPlaceholder")}
              required
              maxLength={20}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="entry-note">{t("note")}</FieldLabel>
            <Input
              id="entry-note"
              name="note"
              placeholder={t("notePlaceholder")}
              maxLength={1000}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 data-slot="icon" className="animate-spin" />
            ) : (
              <Plus data-slot="icon" />
            )}
            {t("submit")}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
