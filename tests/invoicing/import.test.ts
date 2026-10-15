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
    cvr: "44444442",
    address: "Prøvegade 3",
    zipcode: "5000",
    city: "Odense C",
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
      entryDate: "2026-03-16",
      durationMinutes: 480,
      companyId,
      note: "Historisk arbejde",
    }))!;

    const invoiceId = await importHistoricInvoice(CTX, {
      companyId,
      invoiceNumber: 512,
      invoiceDate: "2026-03-31",
      status: "paid",
      paidDate: "2026-04-10",
      lines: [
        {
          description: "Projektleder",
          quantityHundredths: 4200,
          unitPriceOere: 95000,
          timeEntryIds: [entryId],
        },
      ],
    });

    const detail = await getInvoiceDetail(CTX, invoiceId);
    expect(detail?.invoice.invoiceNumber).toBe(512);
    expect(detail?.invoice.invoiceDate).toBe("2026-03-31");
    expect(detail?.invoice.dueDate).toBe("2026-04-14");
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.invoice.netOere).toBe(3_990_000); // 42 t à 950 kr. = 39.900 kr.
    expect(detail?.invoice.vatOere).toBe(997_500);
    expect(detail?.invoice.buyerName).toBe("Gammel kunde A/S");
    expect(detail?.invoice.sellerCvr).toBe("44444442");

    const entry = await admin.query(`select invoice_line_id from time_entries where id = $1`, [
      entryId,
    ]);
    expect(entry.rows[0].invoice_line_id).not.toBeNull();
  });

  it("pushes the counter past the imported history", async () => {
    expect(await getNextInvoiceNumber(CTX)).toBe(513);

    const draftId = await createDraft(CTX, companyId);
    await addLine(CTX, draftId, {
      description: "Første egen faktura",
      quantityHundredths: 100,
      unit: "hour",
      unitPriceOere: 95000,
      vatCategory: "standard",
      vatRateBp: 2500,
    });
    expect(await issueInvoice(CTX, draftId)).toBe(513);
  });

  it("refuses a number the history already used", async () => {
    await expect(
      importHistoricInvoice(CTX, {
        companyId,
        invoiceNumber: 512,
        invoiceDate: "2026-03-31",
        status: "paid",
        lines: [{ description: "Dublet", quantityHundredths: 100, unitPriceOere: 1000 }],
      }),
    ).rejects.toThrow("NUMBER_TAKEN");
  });

  it("leaves the imported invoice as immutable as any other", async () => {
    await expect(
      admin.query(`update invoices set net_oere = 1 where invoice_number = 512`),
    ).rejects.toThrow(/immutable/);
  });
});
