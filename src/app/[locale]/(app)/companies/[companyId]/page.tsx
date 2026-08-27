import { ArrowLeft, Clock } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/core/auth/session";
import type { PipelineStage } from "@/core/db/schema";
import { formatMinutes } from "@/modules/time/duration";
import { getCompanyDetail } from "@/modules/crm/service";
import { getCustomerEconomy } from "@/modules/invoicing/economy";
import { Link, redirect } from "@/i18n/navigation";
import { ActivityComposer } from "./activity-composer";
import { CompanyEconomyCard } from "./company-economy-card";
import { AddContactDialog } from "./add-contact-dialog";
import { CompanyActions } from "./company-actions";
import { ContactDeleteButton } from "./contact-delete-button";
import { StageSelect } from "./stage-select";
import { TimelineItem, type TimelineEntry } from "./timeline-item";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crm.detail");
  return { title: t("info") };
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { companyId } = await params;
  const detail = await getCompanyDetail(context, companyId);
  if (!detail) notFound();

  const [t, tContacts, tTimeline] = await Promise.all([
    getTranslations("crm.detail"),
    getTranslations("crm.contacts"),
    getTranslations("crm.timeline"),
  ]);
  const format = await getFormatter();
  const { company, contacts, timeline, trackedMinutes } = detail;
  const economy = (await getCustomerEconomy(context)).find((row) => row.companyId === companyId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/companies"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" />
          {t("back")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
            <p className="text-muted-foreground text-sm">
              {[company.cvr ? `CVR ${company.cvr}` : null, company.companyType, company.city]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StageSelect companyId={company.id} stage={company.pipelineStage as PipelineStage} />
            <CompanyActions
              companyId={company.id}
              companyName={company.name}
              initialValues={{
                name: company.name,
                cvr: company.cvr ?? "",
                address: company.address ?? "",
                zipcode: company.zipcode ?? "",
                city: company.city ?? "",
                phone: company.phone ?? "",
                email: company.email ?? "",
                website: company.website ?? "",
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{tTimeline("title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ActivityComposer companyId={company.id} />
            {timeline.length === 0 ? (
              <p className="text-muted-foreground text-sm">{tTimeline("empty")}</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {timeline.map((entry) => (
                  <TimelineItem
                    key={entry.id}
                    entry={entry as TimelineEntry}
                    formattedTime={format.dateTime(entry.happenedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("info")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {company.address || company.zipcode || company.city ? (
                <p>
                  {company.address}
                  {company.address ? <br /> : null}
                  {[company.zipcode, company.city].filter(Boolean).join(" ")}
                </p>
              ) : null}
              {company.phone ? <p>{company.phone}</p> : null}
              {company.email ? <p className="truncate">{company.email}</p> : null}
              {company.website ? <p className="truncate">{company.website}</p> : null}
              {company.industryText ? (
                <p className="text-muted-foreground">
                  {t("industry")}: {company.industryText}
                </p>
              ) : null}
              <p className="text-muted-foreground inline-flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {t("trackedTime")}: {formatMinutes(trackedMinutes)}
              </p>
            </CardContent>
          </Card>

          {economy ? <CompanyEconomyCard companyId={company.id} economy={economy} /> : null}

          <Card>
            <CardHeader>
              <CardTitle>{tContacts("title")}</CardTitle>
              <CardAction>
                <AddContactDialog companyId={company.id} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {contacts.length === 0 ? (
                <p className="text-muted-foreground text-sm">{tContacts("empty")}</p>
              ) : (
                contacts.map((contact) => (
                  <div key={contact.id} className="group flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {contact.name}
                        {contact.isPrimary ? (
                          <span className="text-primary ml-1.5 text-xs">
                            {tContacts("primaryBadge")}
                          </span>
                        ) : null}
                      </p>
                      {contact.title ? (
                        <p className="text-muted-foreground">{contact.title}</p>
                      ) : null}
                      {contact.email ? (
                        <p className="text-muted-foreground truncate">{contact.email}</p>
                      ) : null}
                      {contact.phone ? (
                        <p className="text-muted-foreground">{contact.phone}</p>
                      ) : null}
                    </div>
                    <ContactDeleteButton contactId={contact.id} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
