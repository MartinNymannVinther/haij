import type { NextRequest } from "next/server";
import { requireOrgContext } from "@/core/auth/guard";
import { getOrgProfile } from "@/modules/invoicing/profile";
import {
  getTimeReport,
  REPORT_GROUPINGS,
  REPORT_STATUSES,
  type ReportGrouping,
  type ReportStatus,
} from "@/modules/time/report";
import { buildReportSheet } from "@/modules/time/report-export";
import { renderTimeReportPdf } from "@/modules/time/report-pdf";

export const runtime = "nodejs";

/**
 * The time report as a file. Same filters as the page, read from the
 * query string, so a link to the screen and a link to the download always
 * describe the same set of hours.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w-]{1,64}$/;

function param(request: NextRequest, name: string, pattern: RegExp): string | null {
  const value = request.nextUrl.searchParams.get(name);
  return value && pattern.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const groupingParam = request.nextUrl.searchParams.get("grouping");
  const grouping = (REPORT_GROUPINGS as readonly string[]).includes(groupingParam ?? "")
    ? (groupingParam as ReportGrouping)
    : "none";
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = (REPORT_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as ReportStatus)
    : "all";

  const filters = {
    from: param(request, "from", ISO),
    to: param(request, "to", ISO),
    companyId: param(request, "companyId", ID),
    projectId: param(request, "projectId", ID),
    roleId: param(request, "roleId", ID),
    invoiceId: param(request, "invoiceId", ID),
    status,
  };

  const [report, profile] = await Promise.all([
    getTimeReport(ctx, filters, grouping),
    getOrgProfile(ctx),
  ]);

  const invoiceNumber =
    report.rows.find((row) => row.invoiceNumber !== null)?.invoiceNumber ?? null;
  const companyName = filters.companyId ? (report.rows[0]?.companyName ?? null) : null;
  const context = {
    orgName: profile?.legalName ?? "Haij",
    companyName,
    invoiceNumber: filters.invoiceId ? invoiceNumber : null,
    filters,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const base =
    filters.invoiceId && invoiceNumber ? `timer-faktura-${invoiceNumber}` : `timer-${stamp}`;

  if (format === "pdf") {
    const pdf = await renderTimeReportPdf(report, context);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${base}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const sheet = buildReportSheet(report, context);
  return new Response(new Uint8Array(sheet), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
