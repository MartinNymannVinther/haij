import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { invoiceLines, invoices } from "@/core/db/schema";
import { renderInvoicePdf } from "@/modules/invoicing/pdf";

/**
 * Renders a representative invoice and credit note. Content assertions on
 * PDFs are brittle, so this proves the pipeline produces a real PDF with
 * pages; layout is reviewed by eye (set PDF_SNAPSHOT_DIR to dump files).
 */

type Invoice = typeof invoices.$inferSelect;
type Line = typeof invoiceLines.$inferSelect;

const now = new Date();

function fakeInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: "inv_pdf_test",
    orgId: "org_pdf",
    type: "invoice",
    creditedInvoiceId: null,
    companyId: "comp_pdf",
    status: "issued",
    invoiceNumber: 1042,
    invoiceDate: "2026-08-26",
    deliveryDate: "2026-08-26",
    dueDate: "2026-09-03",
    paymentTermsDays: 8,
    currency: "DKK",
    buyerName: "Kunde Alfa ApS",
    buyerCvr: "11111118",
    buyerAddress: "Alfavej 1, 2. th",
    buyerZipcode: "8000",
    buyerCity: "Aarhus C",
    buyerEanGln: null,
    buyerReference: "Projekt Ø-2026",
    sellerName: "Vinther Consulting ApS",
    sellerCvr: "44444442",
    sellerAddress: "Havnegade 12",
    sellerZipcode: "8000",
    sellerCity: "Aarhus C",
    sellerEmail: "faktura@vinther.example",
    sellerPhone: "+45 12 34 56 78",
    sellerBankReg: "1234",
    sellerBankKonto: "0012345678",
    note: "Tak for samarbejdet. Spørgsmål til fakturaen? Skriv endelig.",
    netOere: 270000,
    vatOere: 67500,
    grossOere: 337500,
    issuedAt: now,
    sentAt: null,
    paidAt: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fakeLine(overrides: Partial<Line>): Line {
  return {
    id: `line_${Math.abs(overrides.position ?? 0)}`,
    orgId: "org_pdf",
    invoiceId: "inv_pdf_test",
    position: 0,
    description: "Rådgivning",
    quantityHundredths: 150,
    unit: "hour",
    unitPriceOere: 120000,
    vatCategory: "standard",
    vatRateBp: 2500,
    lineNetOere: 180000,
    lineVatOere: 45000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("renderInvoicePdf", () => {
  it("renders an issued invoice with æøå to a valid PDF", async () => {
    const lines = [
      fakeLine({
        position: 0,
        description: "24.08.2026 · Workshop om løsningsdesign hos kunden i Århus",
      }),
      fakeLine({
        position: 1,
        description: "25.08.2026 · Opfølgning og næste skridt",
        quantityHundredths: 75,
        lineNetOere: 90000,
        lineVatOere: 22500,
      }),
    ];
    const pdf = await renderInvoicePdf(fakeInvoice({}), lines);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.toString("latin1")).toContain("/Type /Page");

    if (process.env.PDF_SNAPSHOT_DIR) {
      await writeFile(`${process.env.PDF_SNAPSHOT_DIR}/faktura.pdf`, pdf);
    }
  });

  it("renders a credit note with negative amounts", async () => {
    const pdf = await renderInvoicePdf(
      fakeInvoice({
        type: "credit_note",
        invoiceNumber: 1043,
        creditedInvoiceId: "inv_original",
        note: "Kreditnota for faktura 1042",
        netOere: -270000,
        vatOere: -67500,
        grossOere: -337500,
      }),
      [
        fakeLine({
          position: 0,
          quantityHundredths: -150,
          lineNetOere: -180000,
          lineVatOere: -45000,
        }),
        fakeLine({
          position: 1,
          quantityHundredths: -75,
          lineNetOere: -90000,
          lineVatOere: -22500,
        }),
      ],
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    if (process.env.PDF_SNAPSHOT_DIR) {
      await writeFile(`${process.env.PDF_SNAPSHOT_DIR}/kreditnota.pdf`, pdf);
    }
  });
});
