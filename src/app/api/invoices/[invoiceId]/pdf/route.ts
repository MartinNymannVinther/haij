import type { NextRequest } from "next/server";
import { requireOrgContext } from "@/core/auth/guard";
import { getOrgLogo } from "@/modules/invoicing/logo";
import { getInvoiceDetail } from "@/modules/invoicing/service";
import { renderInvoicePdf } from "@/modules/invoicing/pdf";

export const runtime = "nodejs";

/**
 * On-demand PDF for an issued invoice or credit note, behind the session.
 * Drafts have no number and would not satisfy the fakturakrav, so they
 * get 404 like anything else the caller must not see — the response never
 * distinguishes "not yours" from "not there" or "not ready".
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const { invoiceId } = await params;
  if (!/^[\w-]{1,64}$/.test(invoiceId)) return new Response("Not found", { status: 404 });

  const detail = await getInvoiceDetail(ctx, invoiceId);
  if (!detail || detail.invoice.status === "draft") {
    return new Response("Not found", { status: 404 });
  }

  const logo = await getOrgLogo(ctx);
  const pdf = await renderInvoicePdf(detail.invoice, detail.lines, logo?.dataUrl ?? null);
  const kind = detail.invoice.type === "credit_note" ? "kreditnota" : "faktura";
  const filename = `${kind}-${detail.invoice.invoiceNumber}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
