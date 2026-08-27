import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { todayInCopenhagen, addDaysIso } from "@/core/dates";
import { createCompany } from "@/modules/crm/service";
import { addEntry } from "@/modules/time/service";
import {
  getCustomerEconomy,
  getYearOverview,
  setCustomerFrame,
  setRevenueTarget,
} from "@/modules/invoicing/economy";
import { getOrgProfile, upsertOrgProfile } from "@/modules/invoicing/profile";
import {
  addLine,
  createCreditNote,
  createDraft,
  createDraftFromTime,
  deleteDraft,
  getInvoiceDetail,
  getInvoicingOverview,
  issueInvoice,
  listInvoices,
  markPaid,
  markSent,
  removeLine,
  updateDraft,
  updateLine,
} from "@/modules/invoicing/service";
import { adminPool } from "../helpers/db";

/**
 * The whole phase-2 flow through the real services: profile -> time ->
 * draft-from-time -> issue -> sent/paid -> credit note, plus the economy
 * views and the friendly domain errors. Org B exists to prove that
 * cross-tenant references fail and that issuing requires a profile.
 */

const ORG_A = "org_flow_inv_a";
const ORG_B = "org_flow_inv_b";
const USER_A = "user_flow_inv_a";
const USER_B = "user_flow_inv_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };
const CTX_B = { orgId: ORG_B, userId: USER_B };

const today = todayInCopenhagen();
const thisYear = Number(today.slice(0, 4));
const thisMonth = Number(today.slice(5, 7));

let admin: Pool;
let companyA: string;
let companyB: string;
let invoice1: string; // draft-from-time -> issued as no. 1

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Flow Inv A', 'flow-inv-a', now()), ($2, 'Flow Inv B', 'flow-inv-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Inv A', 'flow-inv-a@example.com'), ($2, 'Inv B', 'flow-inv-b@example.com')`,
    [USER_A, USER_B],
  );

  companyA = await createCompany(
    CTX_A,
    {
      name: "Kunde Alfa ApS",
      cvr: "11111118",
      address: "Alfavej 1",
      zipcode: "8000",
      city: "Aarhus C",
    },
    "manual",
  );
  companyB = await createCompany(CTX_B, { name: "Kunde Beta A/S" }, "manual");
});

afterAll(async () => {
  await admin?.end();
});

describe("org profile", () => {
  it("upserts and reads back", async () => {
    expect(await getOrgProfile(CTX_A)).toBeNull();
    await upsertOrgProfile(CTX_A, {
      legalName: "Vinther Consulting",
      cvr: "44444442",
      address: "Havnegade 12",
      zipcode: "8000",
      city: "Aarhus C",
      email: "faktura@example.com",
      bankReg: "1234",
      bankKonto: "0012345678",
      defaultPaymentTermsDays: 8,
      defaultHourlyRateOere: 80000,
    });
    const created = await getOrgProfile(CTX_A);
    expect(created?.legalName).toBe("Vinther Consulting");

    await upsertOrgProfile(CTX_A, {
      legalName: "Vinther Consulting ApS",
      cvr: "44444442",
      address: "Havnegade 12",
      zipcode: "8000",
      city: "Aarhus C",
      defaultPaymentTermsDays: 8,
      defaultHourlyRateOere: 80000,
    });
    const updated = await getOrgProfile(CTX_A);
    expect(updated?.legalName).toBe("Vinther Consulting ApS");
  });
});

describe("draft from unbilled time", () => {
  it("builds one line per entry at the customer rate and links the entries", async () => {
    await setCustomerFrame(CTX_A, companyA, {
      hourlyRateOere: 120000, // 1.200 kr/t beats the org default of 800
      budgetMinutes: 6000,
      budgetAmountOere: 50000000,
    });
    await addEntry(CTX_A, {
      companyId: companyA,
      entryDate: today,
      durationMinutes: 90,
      note: "Workshop",
    });
    await addEntry(CTX_A, { companyId: companyA, entryDate: today, durationMinutes: 45 });

    invoice1 = await createDraftFromTime(CTX_A, companyA);
    const detail = await getInvoiceDetail(CTX_A, invoice1);
    expect(detail?.invoice.status).toBe("draft");
    expect(detail?.invoice.paymentTermsDays).toBe(8); // from the profile
    expect(detail?.lines).toHaveLength(2);
    expect(detail?.lines[0]?.description).toContain("Workshop");
    expect(detail?.lines[1]?.description).toContain("Konsulentarbejde");
    // 1,5 t og 0,75 t à 1.200 kr.
    expect(detail?.lines.map((l) => l.quantityHundredths)).toEqual([150, 75]);
    expect(detail?.invoice.netOere).toBe(270000);
    expect(detail?.invoice.vatOere).toBe(67500);
    expect(detail?.invoice.grossOere).toBe(337500);

    const linked = await admin.query(
      `select count(*)::int as n from time_entries
       where org_id = $1 and invoice_line_id is not null`,
      [ORG_A],
    );
    expect(linked.rows[0].n).toBe(2);
  });

  it("refuses when no unbilled time remains", async () => {
    await expect(createDraftFromTime(CTX_A, companyA)).rejects.toThrow("NO_UNBILLED_TIME");
  });
});

describe("issue", () => {
  it("assigns number 1 and freezes buyer, seller, dates and totals", async () => {
    const number = await issueInvoice(CTX_A, invoice1);
    expect(number).toBe(1);

    const detail = await getInvoiceDetail(CTX_A, invoice1);
    const inv = detail?.invoice;
    expect(inv?.status).toBe("issued");
    expect(inv?.invoiceNumber).toBe(1);
    expect(inv?.invoiceDate).toBe(today);
    expect(inv?.deliveryDate).toBe(today);
    expect(inv?.dueDate).toBe(addDaysIso(today, 8));
    expect(inv?.buyerName).toBe("Kunde Alfa ApS");
    expect(inv?.buyerCvr).toBe("11111118");
    expect(inv?.sellerName).toBe("Vinther Consulting ApS");
    expect(inv?.sellerCvr).toBe("44444442");
    expect(inv?.issuedAt).toBeTruthy();

    const activity = await admin.query(
      `select count(*)::int as n from activities
       where org_id = $1 and company_id = $2 and metadata->>'event' = 'invoice_issued'`,
      [ORG_A, companyA],
    );
    expect(activity.rows[0].n).toBe(1);
  });

  it("gives friendly errors once issued", async () => {
    await expect(updateDraft(CTX_A, invoice1, { note: "x" })).rejects.toThrow("INVOICE_NOT_DRAFT");
    await expect(deleteDraft(CTX_A, invoice1)).rejects.toThrow("INVOICE_NOT_DRAFT");
    await expect(
      addLine(CTX_A, invoice1, {
        description: "Ekstra",
        quantityHundredths: 100,
        unit: "hour",
        unitPriceOere: 1,
        vatCategory: "standard",
        vatRateBp: 2500,
      }),
    ).rejects.toThrow("INVOICE_NOT_DRAFT");
  });

  it("requires a profile before issuing (org B has none)", async () => {
    const draftB = await createDraft(CTX_B, companyB);
    await addLine(CTX_B, draftB, {
      description: "Arbejde",
      quantityHundredths: 100,
      unit: "hour",
      unitPriceOere: 100000,
      vatCategory: "standard",
      vatRateBp: 2500,
    });
    await expect(issueInvoice(CTX_B, draftB)).rejects.toThrow("PROFILE_MISSING");
  });
});

describe("economy views", () => {
  it("shows realized against the monthly target", async () => {
    await setRevenueTarget(CTX_A, thisYear, thisMonth, 40000000);
    await setRevenueTarget(CTX_A, thisYear, thisMonth, 45000000); // upsert
    const overview = await getYearOverview(CTX_A, thisYear);
    expect(overview).toHaveLength(12);
    const row = overview.find((r) => r.month === thisMonth);
    expect(row?.targetOere).toBe(45000000);
    expect(row?.realizedOere).toBe(270000);
    expect(row?.outstandingOere).toBe(337500);
  });

  it("shows the customer's frames and consumption", async () => {
    const rows = await getCustomerEconomy(CTX_A);
    const alfa = rows.find((r) => r.companyId === companyA);
    expect(alfa).toMatchObject({
      hourlyRateOere: 120000,
      budgetMinutes: 6000,
      budgetAmountOere: 50000000,
      trackedMinutes: 135,
      unbilledMinutes: 0,
      invoicedNetOere: 270000,
      outstandingGrossOere: 337500,
      paidGrossOere: 0,
    });
  });

  it("dashboard overview counts outstanding and drafts", async () => {
    const overview = await getInvoicingOverview(CTX_A);
    expect(overview.outstandingOere).toBe(337500);
    expect(overview.draftCount).toBe(0);
  });
});

describe("status flow", () => {
  it("sent then paid, and refuses to repeat", async () => {
    await markSent(CTX_A, invoice1);
    await markPaid(CTX_A, invoice1);
    await expect(markSent(CTX_A, invoice1)).rejects.toThrow("INVOICE_NOT_ISSUED");
    await expect(markPaid(CTX_A, invoice1)).rejects.toThrow("INVOICE_NOT_ISSUED");

    const rows = await getCustomerEconomy(CTX_A);
    const alfa = rows.find((r) => r.companyId === companyA);
    expect(alfa?.paidGrossOere).toBe(337500);
    expect(alfa?.outstandingGrossOere).toBe(0);
  });
});

describe("credit note", () => {
  it("negates the lines, keeps the buyer snapshot and takes the next number", async () => {
    const creditId = await createCreditNote(CTX_A, invoice1);
    const draft = await getInvoiceDetail(CTX_A, creditId);
    expect(draft?.invoice.type).toBe("credit_note");
    expect(draft?.invoice.creditedInvoiceId).toBe(invoice1);
    expect(draft?.invoice.note).toBe("Kreditnota for faktura 1");
    expect(draft?.invoice.buyerName).toBe("Kunde Alfa ApS");
    expect(draft?.lines.map((l) => l.quantityHundredths)).toEqual([-150, -75]);
    expect(draft?.invoice.netOere).toBe(-270000);
    expect(draft?.invoice.grossOere).toBe(-337500);

    const number = await issueInvoice(CTX_A, creditId);
    expect(number).toBe(2);

    const overview = await getYearOverview(CTX_A, thisYear);
    expect(overview.find((r) => r.month === thisMonth)?.realizedOere).toBe(0);
  });

  it("cannot credit a draft or another credit note", async () => {
    const bare = await createDraft(CTX_A, null);
    await expect(createCreditNote(CTX_A, bare)).rejects.toThrow("INVOICE_NOT_ISSUED");
    await deleteDraft(CTX_A, bare);
  });
});

describe("manual drafts and lines", () => {
  it("edits lines, keeps totals in sync and enforces issue requirements", async () => {
    const draft = await createDraft(CTX_A, null);
    await expect(issueInvoice(CTX_A, draft)).rejects.toThrow("INVOICE_NO_LINES");

    await addLine(CTX_A, draft, {
      description: "Fast pris",
      quantityHundredths: 100,
      unit: "fixed",
      unitPriceOere: 100000,
      vatCategory: "standard",
      vatRateBp: 2500,
    });
    await addLine(CTX_A, draft, {
      description: "Timer",
      quantityHundredths: 100,
      unit: "hour",
      unitPriceOere: 50000,
      vatCategory: "standard",
      vatRateBp: 2500,
    });
    let detail = await getInvoiceDetail(CTX_A, draft);
    expect(detail?.invoice.netOere).toBe(150000);

    const secondLine = detail?.lines[1];
    await updateLine(CTX_A, secondLine!.id, {
      description: "Timer",
      quantityHundredths: 200,
      unit: "hour",
      unitPriceOere: 50000,
      vatCategory: "standard",
      vatRateBp: 2500,
    });
    detail = await getInvoiceDetail(CTX_A, draft);
    expect(detail?.invoice.netOere).toBe(200000);

    await removeLine(CTX_A, detail!.lines[0]!.id);
    detail = await getInvoiceDetail(CTX_A, draft);
    expect(detail?.invoice.netOere).toBe(100000);

    // No company attached -> issuing must refuse.
    await expect(issueInvoice(CTX_A, draft)).rejects.toThrow("INVOICE_NO_COMPANY");
    await updateDraft(CTX_A, draft, { companyId: companyA, note: "Aftalt fast arbejde" });
    const number = await issueInvoice(CTX_A, draft);
    expect(number).toBe(3);
    await markPaid(CTX_A, draft); // direkte fra issued, uden sent
  });

  it("deleting a draft frees its time entries again", async () => {
    await addEntry(CTX_A, {
      companyId: companyA,
      entryDate: today,
      durationMinutes: 30,
      note: "Ny opgave",
    });
    const draft = await createDraftFromTime(CTX_A, companyA);
    const before = await admin.query(
      `select count(*)::int as n from time_entries where org_id = $1 and invoice_line_id is null`,
      [ORG_A],
    );
    expect(before.rows[0].n).toBe(0);

    await deleteDraft(CTX_A, draft);
    const after = await admin.query(
      `select count(*)::int as n from time_entries where org_id = $1 and invoice_line_id is null`,
      [ORG_A],
    );
    expect(after.rows[0].n).toBe(1);
    expect(await getInvoiceDetail(CTX_A, draft)).toBeNull();
  });
});

describe("cross-tenant", () => {
  it("cannot see or touch the other org's invoices and companies", async () => {
    expect(await getInvoiceDetail(CTX_B, invoice1)).toBeNull();
    await expect(updateDraft(CTX_B, invoice1, { note: "x" })).rejects.toThrow("INVOICE_NOT_FOUND");
    await expect(createDraft(CTX_B, companyA)).rejects.toThrow("COMPANY_NOT_FOUND");
    await expect(createDraftFromTime(CTX_B, companyA)).rejects.toThrow("COMPANY_NOT_FOUND");

    const listB = await listInvoices(CTX_B);
    expect(listB.every((row) => row.id !== invoice1)).toBe(true);
  });
});
