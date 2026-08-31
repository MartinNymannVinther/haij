import type { NextRequest } from "next/server";
import { requireOrgContext } from "@/core/auth/guard";
import { getOrgLogo } from "@/modules/invoicing/logo";
import { getInvoiceDetail } from "@/modules/invoicing/service";
import { renderInvoicePdf } from "@/modules/invoicing/pdf";

export const runtime = "nodejs";

/**
 * On-demand PDF for an invoice or credit note, behind the session.
 *
 * Drafts render too, so what the customer will receive can be read before
 * it is issued. A draft is marked as one in the document itself: a large
 * UDKAST stamp across every page and no invoice number, since a number is
 * only assigned at issue. It cannot be mistaken for an invoice, and it
 * satisfies none of the fakturakrav on purpose.
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
  if (!detail) return new Response("Not found", { status: 404 });

  const logo = await getOrgLogo(ctx);
  const pdf = await renderInvoicePdf(detail.invoice, detail.lines, logo?.dataUrl ?? null);
  const kind = detail.invoice.type === "credit_note" ? "kreditnota" : "faktura";
  const filename =
    detail.invoice.status === "draft"
      ? `${kind}-udkast.pdf`
      : `${kind}-${detail.invoice.invoiceNumber}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
