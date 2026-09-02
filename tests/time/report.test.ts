import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createCompany } from "@/modules/crm/service";
import { setCustomerFrame } from "@/modules/invoicing/economy";
import { upsertOrgProfile } from "@/modules/invoicing/profile";
import { createRole, setRoleRate } from "@/modules/invoicing/roles";
import { createDraftFromTime, issueInvoice } from "@/modules/invoicing/service";
import { createProject } from "@/modules/projects/service";
import { addEntry } from "@/modules/time/service";
import { getTimeReport } from "@/modules/time/report";
import { adminPool } from "../helpers/db";

/**
 * The report is what a customer gets when they ask what they paid for, so
 * two things matter above all: the filters must return exactly the hours
 * asked for, and the money must agree with the invoice built from the
 * same hours. A report that disagrees with its own invoice is worse than
 * no report.
 */

const ORG = "org_report";
const USER = "user_report";
const CTX = { orgId: ORG, userId: USER };

let admin: Pool;
let kasse: string;
let other: string;
let projectId: string;
let roleId: string;
let invoiceId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at)
       values ($1, 'Rapport', 'rapport', now())`,
    [ORG],
  );
  await admin.query(
    `insert into users (id, name, email) values ($1, 'Martin', 'rapport@example.com')`,
    [USER],
  );
  await upsertOrgProfile(CTX, {
    legalName: "Rapport ApS",
    cvr: "30769201",
    address: "Slotsmarken 18",
    zipcode: "2970",
    city: "Hørsholm",
    defaultHourlyRateOere: 80000,
  });

  kasse = await createCompany(CTX, { name: "Eksempel A-kasse" }, "manual");
  other = await createCompany(CTX, { name: "Anden kunde" }, "manual");
  await setCustomerFrame(CTX, other, {
    hourlyRateOere: 150000,
    budgetMinutes: null,
    budgetAmountOere: null,
  });
  projectId = await createProject(CTX, {
    name: "Digitalt Transformationsprogram",
    companyId: kasse,
  });
  roleId = (await createRole(CTX, "Transformation Lead"))!;
  await setRoleRate(CTX, { companyId: kasse }, roleId, 80000);

  // July on the a-kasse, invoiced. August there too, still open. One day elsewhere.
  await addEntry(CTX, {
    entryDate: "2026-07-27",
    durationMinutes: 480,
    projectId,
    companyId: kasse,
    roleId,
    note: "Opstart",
  });
  await addEntry(CTX, {
    entryDate: "2026-07-28",
    durationMinutes: 480,
    projectId,
    companyId: kasse,
    roleId,
  });
  invoiceId = await createDraftFromTime(CTX, kasse, { grouping: "month" });
  await issueInvoice(CTX, invoiceId);

  await addEntry(CTX, {
    entryDate: "2026-08-03",
    durationMinutes: 420,
    projectId,
    companyId: kasse,
    roleId,
  });
  await addEntry(CTX, { entryDate: "2026-08-04", durationMinutes: 300, companyId: other });
});

afterAll(async () => {
  await admin?.end();
});

describe("getTimeReport", () => {
  it("returns every hour when nothing is filtered, valued through the rate hierarchy", async () => {
    const report = await getTimeReport(CTX, {});
    expect(report.rows).toHaveLength(4);
    expect(report.totalMinutes).toBe(1680);
    // 16 t à 800 + 7 t à 800 + 5 t à 1.500 = 12.800 + 5.600 + 7.500 = 25.900 kr.
    expect(report.totalValueOere).toBe(2_590_000);
    expect(report.onInvoiceMinutes).toBe(960);
  });

  it("narrows to a period", async () => {
    const july = await getTimeReport(CTX, { from: "2026-07-01", to: "2026-07-31" });
    expect(july.totalMinutes).toBe(960);
    expect(july.rows.every((row) => row.entryDate.startsWith("2026-07"))).toBe(true);
  });

  it("narrows to a customer, a project and a role", async () => {
    expect((await getTimeReport(CTX, { companyId: other })).totalMinutes).toBe(300);
    expect((await getTimeReport(CTX, { projectId })).totalMinutes).toBe(1380);
    expect((await getTimeReport(CTX, { roleId })).totalMinutes).toBe(1380);
  });

  it("tells invoiced hours from open ones", async () => {
    expect((await getTimeReport(CTX, { status: "billed" })).totalMinutes).toBe(960);
    expect((await getTimeReport(CTX, { status: "unbilled" })).totalMinutes).toBe(720);
  });

  it("returns exactly the hours behind one invoice, and agrees with its total", async () => {
    const report = await getTimeReport(CTX, { invoiceId });
    expect(report.rows).toHaveLength(2);
    expect(report.totalMinutes).toBe(960);

    const [invoice] = (
      await admin.query<{ net_oere: string }>(`select net_oere from invoices where id = $1`, [
        invoiceId,
      ])
    ).rows;
    expect(report.totalValueOere).toBe(Number(invoice!.net_oere));
    expect(report.rows.every((row) => row.invoiceNumber !== null)).toBe(true);
  });

  it("subtotals by the chosen grouping without losing the total", async () => {
    const report = await getTimeReport(CTX, {}, "month");
    expect(report.groups.map((group) => group.label)).toEqual(["juli 2026", "august 2026"]);
    expect(report.groups.reduce((sum, group) => sum + group.minutes, 0)).toBe(report.totalMinutes);
    expect(report.groups.reduce((sum, group) => sum + group.valueOere, 0)).toBe(
      report.totalValueOere,
    );
  });

  it("names the bucket for work that falls outside the grouping", async () => {
    const report = await getTimeReport(CTX, {}, "project");
    expect(report.groups.map((group) => group.label)).toContain("Uden projekt");
  });
});
