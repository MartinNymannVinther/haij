"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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

export type TaskOption = { id: string; title: string; projectId: string };

export type RoleOption = { id: string; name: string };

function PickerSelect({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  items: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange((v as string) ?? NONE)}>
      <SelectTrigger aria-label={label}>
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

export function AddEntryForm({
  defaultDate,
  companies,
  projects,
  tasks,
  roles,
}: {
  defaultDate: string;
  companies: Array<{ id: string; name: string }>;
  projects: ProjectOption[];
  tasks: TaskOption[];
  roles: RoleOption[];
}) {
  const t = useTranslations("time.add");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>(NONE);
  const [projectId, setProjectId] = useState<string>(NONE);
  const [taskId, setTaskId] = useState<string>(NONE);
  const [roleId, setRoleId] = useState<string>(NONE);
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
  const taskItems = useMemo(
    () => [
      { value: NONE, label: t("noTask") },
      ...tasks
        .filter((task) => projectId === NONE || task.projectId === projectId)
        .map((task) => ({ value: task.id, label: task.title })),
    ],
    [tasks, projectId, t],
  );
  const roleItems = [
    { value: NONE, label: t("noRole") },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ];

  function applyProject(next: string) {
    setProjectId(next);
    if (next !== NONE) {
      const project = projects.find((p) => p.id === next);
      if (project?.companyId) setCompanyId(project.companyId);
    }
    // A task from another project no longer applies.
    setTaskId((current) => {
      if (current === NONE) return current;
      const task = tasks.find((item) => item.id === current);
      return task && (next === NONE || task.projectId === next) ? current : NONE;
    });
  }

  function applyTask(next: string) {
    setTaskId(next);
    if (next !== NONE) {
      const task = tasks.find((item) => item.id === next);
      if (task) applyProjectFromTask(task.projectId);
    }
  }

  function applyProjectFromTask(nextProjectId: string) {
    setProjectId(nextProjectId);
    const project = projects.find((p) => p.id === nextProjectId);
    if (project?.companyId) setCompanyId(project.companyId);
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
      taskId: taskId === NONE ? null : taskId,
      roleId: roleId === NONE ? null : roleId,
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
    setTaskId(NONE);
    setRoleId(NONE);
    toast.success(t("addedToast"));
    router.refresh();
  }

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[9rem_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem_minmax(8rem,1.2fr)_auto]"
        >
          <Field>
            <FieldLabel htmlFor="entry-date">{t("date")}</FieldLabel>
            <Input
              key={defaultDate}
              id="entry-date"
              name="entryDate"
              type="date"
              defaultValue={defaultDate}
              required
            />
          </Field>
          <Field>
            <FieldLabel>{t("company")}</FieldLabel>
            <PickerSelect
              value={companyId}
              onChange={setCompanyId}
              items={companyItems}
              label={t("company")}
            />
          </Field>
          <Field>
            <FieldLabel>{t("project")}</FieldLabel>
            <PickerSelect
              value={projectId}
              onChange={applyProject}
              items={projectItems}
              label={t("project")}
            />
          </Field>
          <Field>
            <FieldLabel>{t("task")}</FieldLabel>
            <PickerSelect value={taskId} onChange={applyTask} items={taskItems} label={t("task")} />
          </Field>
          <Field>
            <FieldLabel>{t("role")}</FieldLabel>
            <PickerSelect value={roleId} onChange={setRoleId} items={roleItems} label={t("role")} />
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
