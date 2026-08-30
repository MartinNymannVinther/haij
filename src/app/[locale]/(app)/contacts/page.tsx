import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ContactDialog } from "@/components/contact-dialog";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedFilter } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/core/auth/session";
import { CONTACT_CATEGORIES, type ContactCategory } from "@/core/db/schema";
import { countContactsByCategory, listAllContacts } from "@/modules/crm/service";
import { CONTACT_CATEGORY_CLASS, CONTACT_CATEGORY_ORDER } from "@/modules/crm/contact-meta";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crm.contactList");
  return { title: t("title") };
}

function isCategory(value: string | undefined): value is ContactCategory {
  return Boolean(value) && (CONTACT_CATEGORIES as readonly string[]).includes(value!);
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { q, category } = await searchParams;
  const active = isCategory(category) ? category : undefined;

  const [t, tCategories, rows, counts] = await Promise.all([
    getTranslations("crm.contactList"),
    getTranslations("crm.categories"),
    listAllContacts(context, q, active),
    countContactsByCategory(context),
  ]);

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={counts.all > 0 ? t("subtitle", { count: counts.all }) : undefined}
      />

      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="min-w-[16rem] flex-1">
          {active ? <input type="hidden" name="category" value={active} /> : null}
          <Input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
        </form>
      </div>

      <SegmentedFilter
        className="self-start"
        items={[
          {
            key: "all",
            label: (
              <>
                {t("filterAll")}
                <span className="text-label ml-1.5 tabular-nums">{counts.all}</span>
              </>
            ),
            href: { pathname: "/contacts" as const, query: q ? { q } : {} },
            active: !active,
          },
          ...CONTACT_CATEGORY_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => ({
            key,
            label: (
              <>
                {tCategories(key)}
                <span className="text-label ml-1.5 tabular-nums">{counts[key]}</span>
              </>
            ),
            href: {
              pathname: "/contacts" as const,
              query: q ? { q, category: key } : { category: key },
            },
            active: active === key,
          })),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={counts.all === 0 ? t("empty") : t("noResults")}
          hint={counts.all === 0 ? t("emptyHint") : undefined}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nameHead")}</TableHead>
                <TableHead>{t("companyHead")}</TableHead>
                <TableHead>{t("categoryHead")}</TableHead>
                <TableHead>{t("contactHead")}</TableHead>
                <TableHead className="w-9" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((contact) => (
                <TableRow key={contact.id} className="group/row">
                  <TableCell className="text-[0.845rem] font-medium">
                    {contact.name}
                    {contact.title ? (
                      <span className="text-meta block text-[0.78rem] font-normal">
                        {contact.title}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-[0.8125rem]">
                    <Link
                      href={`/companies/${contact.companyId}`}
                      className="hover:underline underline-offset-4"
                    >
                      {contact.companyName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {contact.categories.map((key) => (
                        <span
                          key={key}
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 text-[0.7rem] font-medium",
                            CONTACT_CATEGORY_CLASS[key],
                          )}
                        >
                          {tCategories(key)}
                        </span>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="text-meta text-[0.8125rem]">
                    <span className="flex flex-col gap-0.5">
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="hover:text-foreground flex items-center gap-1.5"
                        >
                          <Mail className="size-3.5 shrink-0" />
                          {contact.email}
                        </a>
                      ) : null}
                      {contact.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5 shrink-0" />
                          {contact.phone}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="w-9 pr-2">
                    <ContactDialog
                      companyId={contact.companyId}
                      contact={contact}
                      trigger={
                        <span className="text-primary cursor-pointer text-[0.78rem] font-medium opacity-0 transition-opacity group-hover/row:opacity-100">
                          {t("editTitle")}
                        </span>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
