import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createCompany } from "@/modules/crm/service";
import { importHistoricInvoice } from "@/modules/invoicing/import";
import { getNextInvoiceNumber } from "@/modules/invoicing/numbering";
import { upsertOrgProfile } from "@/modules/invoicing/profile";
import { getInvoiceDetail, createDraft, addLine, issueInvoice } from "@/modules/invoicing/service";
import { addEntry } from "@/modules/time/service";
import { adminPool } from "../helpers/db";

/**
 * Moving an existing business's invoice history in: the numbers, dates
 * and payments the old system had, with the immutability rules intact
 * and the counter left pointing past the imported history.
 */

const ORG = "org_import";
const USER = "user_import";
const CTX = { orgId: ORG, userId: USER };

let admin: Pool;
let companyId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values ($1, 'Import', 'import', now())`,
    [ORG],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'I', 'import@example.com')`, [
    USER,
  ]);
  await upsertOrgProfile(CTX, {
    legalName: "Import ApS",
    cvr: "30769201",
    address: "Slotsmarken 18",
    zipcode: "2970",
    city: "Hørsholm",
    defaultPaymentTermsDays: 14,
  });
  companyId = await createCompany(CTX, { name: "Gammel kunde A/S" }, "manual");
});

afterAll(async () => {
  await admin?.end();
});

describe("importHistoricInvoice", () => {
  it("keeps the old number, date and payment, and marks the hours billed", async () => {
    const entryId = (await addEntry(CTX, {
      entryDate: "2026-01-15",
      durationMinutes: 480,
      companyId,
      note: "Historisk arbejde",
    }))!;

    const invoiceId = await importHistoricInvoice(CTX, {
      companyId,
      invoiceNumber: 278,
      invoiceDate: "2026-01-30",
      status: "paid",
      paidDate: "2026-02-13",
      lines: [
        {
          description: "Transformation Lead",
          quantityHundredths: 13650,
          unitPriceOere: 80000,
          timeEntryIds: [entryId],
        },
      ],
    });

    const detail = await getInvoiceDetail(CTX, invoiceId);
    expect(detail?.invoice.invoiceNumber).toBe(278);
    expect(detail?.invoice.invoiceDate).toBe("2026-01-30");
    expect(detail?.invoice.dueDate).toBe("2026-02-13");
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.invoice.netOere).toBe(10_920_000); // 109.200 kr.
    expect(detail?.invoice.vatOere).toBe(2_730_000);
    expect(detail?.invoice.buyerName).toBe("Gammel kunde A/S");
    expect(detail?.invoice.sellerCvr).toBe("30769201");

    const entry = await admin.query(`select invoice_line_id from time_entries where id = $1`, [
      entryId,
    ]);
    expect(entry.rows[0].invoice_line_id).not.toBeNull();
  });

  it("pushes the counter past the imported history", async () => {
    expect(await getNextInvoiceNumber(CTX)).toBe(279);

    const draftId = await createDraft(CTX, companyId);
    await addLine(CTX, draftId, {
      description: "Første egen faktura",
      quantityHundredths: 100,
      unit: "hour",
      unitPriceOere: 80000,
      vatCategory: "standard",
      vatRateBp: 2500,
    });
    expect(await issueInvoice(CTX, draftId)).toBe(279);
  });

  it("refuses a number the history already used", async () => {
    await expect(
      importHistoricInvoice(CTX, {
        companyId,
        invoiceNumber: 278,
        invoiceDate: "2026-01-30",
        status: "paid",
        lines: [{ description: "Dublet", quantityHundredths: 100, unitPriceOere: 1000 }],
      }),
    ).rejects.toThrow("NUMBER_TAKEN");
  });

  it("leaves the imported invoice as immutable as any other", async () => {
    await expect(
      admin.query(`update invoices set net_oere = 1 where invoice_number = 278`),
    ).rejects.toThrow(/immutable/);
  });
});
