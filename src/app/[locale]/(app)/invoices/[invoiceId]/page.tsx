import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/core/auth/session";
import { listCompanies } from "@/modules/crm/service";
import { draftHasTimeEntries, getInvoiceDetail } from "@/modules/invoicing/service";
import { redirect } from "@/i18n/navigation";
import { DraftEditor } from "./draft-editor";
import { IssuedView } from "./issued-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoicing.detail");
  return { title: t("title") };
}

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const { invoiceId } = await params;
  const detail = await getInvoiceDetail(context, invoiceId);
  if (!detail) notFound();

  if (detail.invoice.status === "draft") {
    const companies = await listCompanies(context);
    return (
      <DraftEditor
        invoice={detail.invoice}
        lines={detail.lines}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        hasProfile={Boolean(detail.profile)}
        hasTimeEntries={await draftHasTimeEntries(context, invoiceId)}
      />
    );
  }

  return <IssuedView invoice={detail.invoice} lines={detail.lines} />;
}
