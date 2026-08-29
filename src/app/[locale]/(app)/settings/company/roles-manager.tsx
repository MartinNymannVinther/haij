"use client";

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/modules/invoicing/actions";
import { useRouter } from "@/i18n/navigation";

export type RoleRow = { id: string; name: string };

export function RolesManager({ roles }: { roles: RoleRow[] }) {
  const t = useTranslations("orgProfile.roles");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [busyRole, setBusyRole] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error(t("invalid"));
      return;
    }
    setPending(true);
    const result = editing
      ? await updateRoleAction(editing.id, { name })
      : await createRoleAction({ name });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error === "invalid" ? t("nameTaken") : tCommon("error"));
      return;
    }
    formElement.reset();
    setEditing(null);
    router.refresh();
  }

  async function handleDelete(roleId: string) {
    setBusyRole(roleId);
    const result = await deleteRoleAction(roleId);
    setBusyRole(null);
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
      <CardContent className="flex flex-col gap-4">
        {roles.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {roles.map((role) => (
              <li
                key={role.id}
                className="group border-border flex items-center gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{role.name}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tCommon("edit")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => setEditing(role)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tCommon("delete")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(role.id)}
                  disabled={busyRole === role.id}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          key={editing?.id ?? "new"}
          onSubmit={handleSubmit}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            name="name"
            placeholder={t("namePlaceholder")}
            maxLength={100}
            required
            defaultValue={editing?.name ?? ""}
            className="min-w-40 flex-1"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? (
              <Loader2 data-slot="icon" className="animate-spin" />
            ) : editing ? null : (
              <Plus data-slot="icon" />
            )}
            {editing ? tCommon("save") : t("add")}
          </Button>
          {editing ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={tCommon("cancel")}
              onClick={() => setEditing(null)}
            >
              <X />
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
