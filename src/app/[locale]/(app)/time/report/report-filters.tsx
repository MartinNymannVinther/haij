"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { REPORT_GROUPINGS, REPORT_STATUSES } from "@/modules/time/report-options";
import { useRouter } from "@/i18n/navigation";

/**
 * A plain GET form. Every filter ends up in the URL, which is what makes
 * a report shareable and what lets the two download links carry exactly
 * the same set of hours as the screen.
 *
 * Native selects rather than the styled ones: this form submits without
 * JavaScript, and a report you can bookmark is worth more here than a
 * matched dropdown.
 */
export function ReportFilters({
  companies,
  projects,
  roles,
}: {
  companies: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("time.report");
  const router = useRouter();

  const selectClass =
    "border-input bg-card h-9 rounded-md border px-2 text-[0.8125rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/18";

  return (
    <Card>
      <CardContent>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field className="w-40">
            <FieldLabel htmlFor="from">{t("from")}</FieldLabel>
            <Input id="from" name="from" type="date" className="h-9" />
          </Field>
          <Field className="w-40">
            <FieldLabel htmlFor="to">{t("to")}</FieldLabel>
            <Input id="to" name="to" type="date" className="h-9" />
          </Field>

          <Field className="w-52">
            <FieldLabel htmlFor="companyId">{t("customer")}</FieldLabel>
            <select id="companyId" name="companyId" className={selectClass} defaultValue="">
              <option value="">{t("any")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </Field>

          <Field className="w-52">
            <FieldLabel htmlFor="projectId">{t("project")}</FieldLabel>
            <select id="projectId" name="projectId" className={selectClass} defaultValue="">
              <option value="">{t("any")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>

          <Field className="w-44">
            <FieldLabel htmlFor="roleId">{t("role")}</FieldLabel>
            <select id="roleId" name="roleId" className={selectClass} defaultValue="">
              <option value="">{t("any")}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </Field>

          <Field className="w-40">
            <FieldLabel htmlFor="status">{t("status")}</FieldLabel>
            <select id="status" name="status" className={selectClass} defaultValue="all">
              {REPORT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field className="w-44">
            <FieldLabel htmlFor="grouping">{t("grouping")}</FieldLabel>
            <select id="grouping" name="grouping" className={selectClass} defaultValue="none">
              {REPORT_GROUPINGS.map((grouping) => (
                <option key={grouping} value={grouping}>
                  {t(`groupings.${grouping}`)}
                </option>
              ))}
            </select>
          </Field>

          <Button type="submit" size="sm">
            {t("apply")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => router.push("/time/report")}
          >
            <RotateCcw data-slot="icon" />
            {t("reset")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
