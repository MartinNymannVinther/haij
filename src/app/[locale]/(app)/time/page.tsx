import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext, getSession } from "@/core/auth/session";
import { todayInCopenhagen } from "@/core/dates";
import {
  formatMinutes,
  isoWeekMonday,
  isoWeekNumber,
  shiftWeek,
  weekDates,
} from "@/modules/time/duration";
import { listWeek } from "@/modules/time/service";
import { listCompanies } from "@/modules/crm/service";
import { listRoles } from "@/modules/invoicing/roles";
import { listActiveProjectsForPicker, listOpenTasksForPicker } from "@/modules/projects/service";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { AddEntryForm } from "./add-entry-form";
import { EntryDeleteButton } from "./entry-delete-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("time");
  return { title: t("title") };
}

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const context = await getOrgContext();
  const session = await getSession();
  if (!context || !session) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }

  const today = todayInCopenhagen();
  const currentMonday = isoWeekMonday(new Date(`${today}T12:00:00Z`));
  const { week } = await searchParams;
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(week ?? "")
    ? isoWeekMonday(new Date(`${week}T12:00:00Z`))
    : currentMonday;

  const [t, entries, companies, projects, tasks, roleList, format] = await Promise.all([
    getTranslations("time"),
    listWeek(context, monday),
    listCompanies(context),
    listActiveProjectsForPicker(context),
    listOpenTasksForPicker(context),
    listRoles(context),
    getFormatter(),
  ]);

  const days = weekDates(monday);
  const weekTotal = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  // Hours already on an invoice, draft or issued: what is on its way out
  // versus what is still sitting here waiting to be billed.
  const billedMinutes = entries.reduce(
    (sum, entry) => (entry.invoiceLineId ? sum + entry.durationMinutes : sum),
    0,
  );
  const byDay = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byDay.get(entry.entryDate) ?? [];
    list.push(entry);
    byDay.set(entry.entryDate, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <span className="text-muted-foreground text-sm">
            {t("weekLabel", { week: isoWeekNumber(monday) })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/time?week=${shiftWeek(monday, -1)}`}
            aria-label={t("prevWeek")}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <ChevronLeft />
          </Link>
          <Link href="/time" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {t("thisWeek")}
          </Link>
          <Link
            href="/time/report"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-2")}
          >
            {t("report.link")}
          </Link>
          <Link
            href={`/time?week=${shiftWeek(monday, 1)}`}
            aria-label={t("nextWeek")}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <ChevronRight />
          </Link>
        </div>
      </div>

      <AddEntryForm
        defaultDate={today >= monday && today <= days[6]! ? today : monday}
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
        projects={projects}
        tasks={tasks}
        roles={roleList.map((role) => ({ id: role.id, name: role.name }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              {format.dateTimeRange(
                new Date(`${monday}T12:00:00Z`),
                new Date(`${days[6]}T12:00:00Z`),
                { day: "numeric", month: "short" },
              )}
            </span>
            <span className="flex items-baseline gap-2 tabular-nums">
              {billedMinutes > 0 ? (
                <span className="text-meta text-[0.78rem] font-normal">
                  {t("weekSplit", {
                    billed: formatMinutes(billedMinutes),
                    unbilled: formatMinutes(weekTotal - billedMinutes),
                  })}
                </span>
              ) : null}
              <span>
                {t("weekTotal")}: {formatMinutes(weekTotal)}
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {weekTotal === 0 && entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("emptyWeek")}</p>
          ) : null}
          {days.map((day) => {
            const dayEntries = byDay.get(day) ?? [];
            if (dayEntries.length === 0) return null;
            const dayTotal = dayEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
            const isToday = day === today;
            return (
              <div key={day}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums",
                        isToday ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    <span
                      className={cn(
                        "truncate text-sm font-medium capitalize",
                        isToday ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {format.dateTime(new Date(`${day}T12:00:00Z`), { weekday: "long" })}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatMinutes(dayTotal)}
                  </span>
                </div>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {dayEntries.map((entry) => (
                    <li key={entry.id} className="group flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">
                          {entry.companyName ?? t("add.noCompany")}
                        </span>
                        {entry.projectName ? (
                          <span className="text-primary"> · {entry.projectName}</span>
                        ) : null}
                        {entry.roleName ? (
                          <span className="text-muted-foreground"> · {entry.roleName}</span>
                        ) : null}
                        {entry.note ? (
                          <span className="text-muted-foreground"> · {entry.note}</span>
                        ) : null}
                      </div>
                      {entry.invoiceId ? (
                        <Link
                          href={`/invoices/${entry.invoiceId}`}
                          className="bg-accent text-accent-foreground shrink-0 rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium tabular-nums hover:underline"
                          title={t("billedTitle")}
                        >
                          {entry.invoiceNumber
                            ? t("billedNumber", { number: entry.invoiceNumber })
                            : t("onDraft")}
                        </Link>
                      ) : null}
                      <span className="text-sm tabular-nums">
                        {formatMinutes(entry.durationMinutes)}
                      </span>
                      {entry.userId === session.user.id &&
                      entry.invoiceStatus !== "issued" &&
                      entry.invoiceStatus !== "sent" &&
                      entry.invoiceStatus !== "paid" ? (
                        <EntryDeleteButton entryId={entry.id} />
                      ) : (
                        <span className="w-7" />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
