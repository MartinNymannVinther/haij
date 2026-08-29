import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createCompany } from "@/modules/crm/service";
import { setCustomerFrame } from "@/modules/invoicing/economy";
import { upsertOrgProfile } from "@/modules/invoicing/profile";
import { resolveHourlyRateOere } from "@/modules/invoicing/rates";
import { createRole, setRoleRate } from "@/modules/invoicing/roles";
import {
  createDraftFromTime,
  getInvoiceDetail,
  unbilledSummary,
} from "@/modules/invoicing/service";
import { addTask, createProject, getProjectDetail } from "@/modules/projects/service";
import { addEntry } from "@/modules/time/service";
import { adminPool } from "../helpers/db";

/**
 * Differentiated rates end to end: the resolution hierarchy
 * role rate on the project -> role rate on the customer -> task ->
 * project -> customer -> org default, plus date-bounded drafts from
 * unbilled time.
 */

const ORG_A = "org_rates_a";
const ORG_B = "org_rates_b";
const USER_A = "user_rates_a";
const USER_B = "user_rates_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };
const CTX_B = { orgId: ORG_B, userId: USER_B };

let admin: Pool;
let companyId: string;
let projectId: string;
let taskId: string;
let roleId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Rates A', 'rates-a', now()), ($2, 'Rates B', 'rates-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Rates A', 'rates-a@example.com'), ($2, 'Rates B', 'rates-b@example.com')`,
    [USER_A, USER_B],
  );

  await upsertOrgProfile(CTX_A, {
    legalName: "Rates Org",
    cvr: "66666663",
    address: "Vej 2",
    zipcode: "8000",
    city: "Aarhus C",
    defaultHourlyRateOere: 80000, // 800 kr/t
  });
  companyId = await createCompany(CTX_A, { name: "Ratekunde ApS" }, "manual");
  await setCustomerFrame(CTX_A, companyId, {
    hourlyRateOere: 100000, // 1.000 kr/t
    budgetMinutes: null,
    budgetAmountOere: null,
  });
  projectId = await createProject(CTX_A, {
    name: "Rateprojekt",
    companyId,
    hourlyRateOere: 120000, // 1.200 kr/t
  });
  taskId = (await addTask(CTX_A, projectId, {
    title: "Specialopgave",
    hourlyRateOere: 150000, // 1.500 kr/t
  }))!;
  roleId = (await createRole(CTX_A, "Seniorrådgivning"))!;
  // Agreed with this customer: 1.400 kr/t, which outranks the task rate.
  await setRoleRate(CTX_A, { companyId }, roleId, 140000);
});

afterAll(async () => {
  await admin?.end();
});

describe("resolveHourlyRateOere", () => {
  it("walks the hierarchy from the project agreement down to the org default", () => {
    const all = {
      projectRoleRateOere: 6,
      companyRoleRateOere: 5,
      taskRateOere: 4,
      projectRateOere: 3,
      companyRateOere: 2,
      orgDefaultRateOere: 1,
    };
    expect(resolveHourlyRateOere(all)).toBe(6);
    expect(resolveHourlyRateOere({ ...all, projectRoleRateOere: null })).toBe(5);
    expect(
      resolveHourlyRateOere({ ...all, projectRoleRateOere: null, companyRoleRateOere: null }),
    ).toBe(4);
    expect(
      resolveHourlyRateOere({
        ...all,
        projectRoleRateOere: null,
        companyRoleRateOere: null,
        taskRateOere: null,
      }),
    ).toBe(3);
    expect(
      resolveHourlyRateOere({
        ...all,
        projectRoleRateOere: null,
        companyRoleRateOere: null,
        taskRateOere: null,
        projectRateOere: null,
      }),
    ).toBe(2);
    expect(resolveHourlyRateOere({ orgDefaultRateOere: 1 })).toBe(1);
    expect(resolveHourlyRateOere({})).toBe(0);
  });
});

describe("entry guards", () => {
  it("rejects foreign roles and mismatched task/project pairs", async () => {
    await expect(
      addEntry(CTX_B, { entryDate: "2026-08-01", durationMinutes: 30, roleId }),
    ).rejects.toThrow("ROLE_NOT_FOUND");

    const otherProject = await createProject(CTX_A, { name: "Andet projekt" });
    await expect(
      addEntry(CTX_A, {
        entryDate: "2026-08-01",
        durationMinutes: 30,
        projectId: otherProject,
        taskId,
      }),
    ).rejects.toThrow("TASK_NOT_FOUND");
  });

  it("a task pins project and company on the entry", async () => {
    const entryId = await addEntry(CTX_A, {
      entryDate: "2026-08-10",
      durationMinutes: 60,
      taskId,
      note: "Specialarbejde",
    });
    const row = await admin.query(`select project_id, company_id from time_entries where id = $1`, [
      entryId,
    ]);
    expect(row.rows[0].project_id).toBe(projectId);
    expect(row.rows[0].company_id).toBe(companyId);
  });
});

describe("draft from time with differentiated rates and date range", () => {
  it("prices each entry by its own resolved rate", async () => {
    // The task entry (2026-08-10) exists from the guard test above.
    await addEntry(CTX_A, {
      entryDate: "2026-08-01",
      durationMinutes: 60,
      companyId,
      note: "Alm. rådgivning",
    });
    await addEntry(CTX_A, {
      entryDate: "2026-08-05",
      durationMinutes: 60,
      projectId,
      note: "Projektarbejde",
    });
    await addEntry(CTX_A, {
      entryDate: "2026-08-15",
      durationMinutes: 60,
      taskId,
      roleId,
      note: "Seniorarbejde",
    });

    const all = await unbilledSummary(CTX_A, companyId);
    expect(all).toEqual({ minutes: 240, entries: 4 });
    const bounded = await unbilledSummary(CTX_A, companyId, {
      from: "2026-08-05",
      to: "2026-08-10",
    });
    expect(bounded).toEqual({ minutes: 120, entries: 2 });

    // Project consumption values every entry through the hierarchy:
    // 1.200 (project) + 1.500 (task) + 1.400 (the customer's agreed rate
    // for the role, which outranks the task's own 1.500) for the three
    // project-linked hours.
    const project = await getProjectDetail(CTX_A, projectId);
    expect(project?.trackedValueOere).toBe(410000);

    const boundedDraft = await createDraftFromTime(CTX_A, companyId, {
      from: "2026-08-05",
      to: "2026-08-10",
    });
    const detail = await getInvoiceDetail(CTX_A, boundedDraft);
    expect(detail?.lines).toHaveLength(2);
    expect(detail?.lines.map((l) => l.unitPriceOere)).toEqual([120000, 150000]);
    expect(detail?.invoice.netOere).toBe(270000);

    const leftovers = await unbilledSummary(CTX_A, companyId);
    expect(leftovers).toEqual({ minutes: 120, entries: 2 });

    const restDraft = await createDraftFromTime(CTX_A, companyId);
    const rest = await getInvoiceDetail(CTX_A, restDraft);
    expect(rest?.lines.map((l) => l.unitPriceOere)).toEqual([100000, 140000]);
    expect(rest?.lines[1]?.description).toContain("(Seniorrådgivning)");
    expect(await unbilledSummary(CTX_A, companyId)).toEqual({ minutes: 0, entries: 0 });
  });

  it("an empty date range refuses politely", async () => {
    await expect(
      createDraftFromTime(CTX_A, companyId, { from: "2030-01-01", to: "2030-01-31" }),
    ).rejects.toThrow("NO_UNBILLED_TIME");
  });
});

describe("a project agreement overrides the customer agreement", () => {
  it("prices the same role higher on the project that negotiated it", async () => {
    await setRoleRate(CTX_A, { projectId }, roleId, 160000); // 1.600 kr/t
    await addEntry(CTX_A, {
      entryDate: "2026-09-02",
      durationMinutes: 60,
      projectId,
      roleId,
      note: "Projektaftale",
    });
    // Same role, same customer, but booked outside the project: the
    // customer agreement applies.
    await addEntry(CTX_A, {
      entryDate: "2026-09-03",
      durationMinutes: 60,
      companyId,
      roleId,
      note: "Uden for projektet",
    });

    const draft = await createDraftFromTime(CTX_A, companyId);
    const detail = await getInvoiceDetail(CTX_A, draft);
    expect(detail?.lines.map((l) => l.unitPriceOere)).toEqual([160000, 140000]);
  });

  it("a role without any agreement falls through to the ordinary rates", async () => {
    const plainRole = (await createRole(CTX_A, "Uden aftale"))!;
    await addEntry(CTX_A, {
      entryDate: "2026-09-04",
      durationMinutes: 60,
      companyId,
      roleId: plainRole,
      note: "Ingen aftale",
    });
    const draft = await createDraftFromTime(CTX_A, companyId);
    const detail = await getInvoiceDetail(CTX_A, draft);
    // Falls past the missing agreement to the customer's 1.000 kr/t.
    expect(detail?.lines.map((l) => l.unitPriceOere)).toEqual([100000]);
  });
});
