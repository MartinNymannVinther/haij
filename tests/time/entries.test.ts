import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createCompany } from "@/modules/crm/service";
import { upsertOrgProfile } from "@/modules/invoicing/profile";
import { createDraftFromTime, issueInvoice } from "@/modules/invoicing/service";
import { addEntry, deleteEntry, listWeek } from "@/modules/time/service";
import { adminPool } from "../helpers/db";

/**
 * Whether an hour has been invoiced has to be visible where the hours
 * are, and an invoiced hour must not quietly disappear from under the
 * document that was built on it.
 */

const ORG = "org_time_entries";
const USER = "user_time_entries";
const CTX = { orgId: ORG, userId: USER };

let admin: Pool;
let companyId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at)
       values ($1, 'Time Entries', 'time-entries', now())`,
    [ORG],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'T', 'time-e@example.com')`, [
    USER,
  ]);
  await upsertOrgProfile(CTX, {
    legalName: "Tid ApS",
    cvr: "30769201",
    address: "Slotsmarken 18",
    zipcode: "2970",
    city: "Hørsholm",
    defaultHourlyRateOere: 80000,
  });
  companyId = await createCompany(CTX, { name: "Timekunde ApS" }, "manual");
});

afterAll(async () => {
  await admin?.end();
});

describe("listWeek", () => {
  it("says which invoice an hour sits on, and which hours sit on none", async () => {
    // Monday 2026-03-02 through Sunday 2026-03-08.
    await addEntry(CTX, {
      entryDate: "2026-03-03",
      durationMinutes: 120,
      companyId,
      note: "Faktureres",
    });
    await addEntry(CTX, {
      entryDate: "2026-03-04",
      durationMinutes: 60,
      companyId,
      note: "Venter",
    });

    const draft = await createDraftFromTime(CTX, companyId, {
      from: "2026-03-03",
      to: "2026-03-03",
    });

    const onDraft = await listWeek(CTX, "2026-03-02");
    const billed = onDraft.find((e) => e.note === "Faktureres");
    const waiting = onDraft.find((e) => e.note === "Venter");
    expect(billed?.invoiceLineId).not.toBeNull();
    expect(billed?.invoiceStatus).toBe("draft");
    expect(billed?.invoiceNumber).toBeNull();
    expect(waiting?.invoiceLineId).toBeNull();
    expect(waiting?.invoiceId).toBeNull();

    const number = await issueInvoice(CTX, draft);
    const afterIssue = await listWeek(CTX, "2026-03-02");
    const issued = afterIssue.find((e) => e.note === "Faktureres");
    expect(issued?.invoiceNumber).toBe(number);
    expect(issued?.invoiceStatus).toBe("issued");
  });
});

describe("deleteEntry", () => {
  it("refuses an hour that sits on an issued invoice", async () => {
    const week = await listWeek(CTX, "2026-03-02");
    const issued = week.find((e) => e.note === "Faktureres")!;
    await expect(deleteEntry(CTX, issued.id)).rejects.toThrow("ENTRY_INVOICED");

    const still = await listWeek(CTX, "2026-03-02");
    expect(still.some((e) => e.id === issued.id)).toBe(true);
  });

  it("allows an hour that is only on a draft, and one on no invoice at all", async () => {
    const waiting = (await listWeek(CTX, "2026-03-02")).find((e) => e.note === "Venter")!;
    expect(await deleteEntry(CTX, waiting.id)).toBe(true);

    const onlyDraft = await addEntry(CTX, {
      entryDate: "2026-03-05",
      durationMinutes: 30,
      companyId,
      note: "Kun udkast",
    });
    await createDraftFromTime(CTX, companyId, { from: "2026-03-05", to: "2026-03-05" });
    expect(await deleteEntry(CTX, onlyDraft!)).toBe(true);
  });
});
