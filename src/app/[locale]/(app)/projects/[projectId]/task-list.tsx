"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { tasks } from "@/core/db/schema";
import { formatDateDa } from "@/core/dates";
import { addTaskAction, deleteTaskAction, setTaskDoneAction } from "@/modules/projects/actions";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Task = typeof tasks.$inferSelect;

export function TaskList({ projectId, tasks: items }: { projectId: string; tasks: Task[] }) {
  const t = useTranslations("projects.tasks");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const openCount = items.filter((task) => !task.isDone).length;

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    setPending(true);
    const result = await addTaskAction({
      projectId,
      title,
      dueDate: String(form.get("dueDate") ?? "") || null,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    formElement.reset();
    router.refresh();
  }

  async function handleToggle(task: Task) {
    setBusyTask(task.id);
    const result = await setTaskDoneAction(task.id, !task.isDone);
    setBusyTask(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    router.refresh();
  }

  async function handleDelete(taskId: string) {
    setBusyTask(taskId);
    const result = await deleteTaskAction(taskId);
    setBusyTask(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return;
    }
    router.refresh();
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          {t("title")}
          {items.length > 0 ? (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {t("openCount", { count: openCount })}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
          <Input
            name="title"
            placeholder={t("placeholder")}
            maxLength={300}
            required
            className="min-w-48 flex-1"
          />
          <Input name="dueDate" type="date" className="w-40" aria-label={t("due")} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? (
              <Loader2 data-slot="icon" className="animate-spin" />
            ) : (
              <Plus data-slot="icon" />
            )}
            {t("add")}
          </Button>
        </form>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((task) => (
              <li
                key={task.id}
                className="group border-border flex items-center gap-3 border-b py-2 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={task.isDone}
                  onChange={() => handleToggle(task)}
                  disabled={busyTask === task.id}
                  aria-label={task.title}
                  className="accent-primary size-4 shrink-0 cursor-pointer"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    task.isDone && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.dueDate && !task.isDone ? (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatDateDa(task.dueDate)}
                  </span>
                ) : null}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tCommon("delete")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(task.id)}
                  disabled={busyTask === task.id}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
