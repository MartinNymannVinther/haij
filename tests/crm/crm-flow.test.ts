import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  addActivity,
  addContact,
  createCompany,
  getCompanyDetail,
  getCrmOverview,
  listCompanies,
  setPipelineStage,
} from "@/modules/crm/service";
import { addEntry, deleteEntry, listWeek, weekTotalMinutes } from "@/modules/time/service";
import { adminPool } from "../helpers/db";

/**
 * End-to-end flow through the real services (and therefore the real RLS
 * path): company -> timeline -> pipeline -> time tracking. Org B exists
 * only to prove cross-tenant references are rejected.
 */

const ORG_A = "org_flow_crm_a";
const ORG_B = "org_flow_crm_b";
const USER_A = "user_flow_crm_a";
const USER_A2 = "user_flow_crm_a2";
const USER_B = "user_flow_crm_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };
const CTX_B = { orgId: ORG_B, userId: USER_B };

let admin: Pool;
let companyA: string;
let companyB: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Flow CRM A', 'flow-crm-a', now()), ($2, 'Flow CRM B', 'flow-crm-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Flow A', 'flow-crm-a@example.com'),
       ($2, 'Flow A2', 'flow-crm-a2@example.com'),
       ($3, 'Flow B', 'flow-crm-b@example.com')`,
    [USER_A, USER_A2, USER_B],
  );
});

afterAll(async () => {
  await admin?.end();
});

describe("company lifecycle", () => {
  it("creates a company with a system activity on the timeline", async () => {
    companyA = await createCompany(
      CTX_A,
      {
        name: "Nordisk Kaffe ApS",
        cvr: "12345678",
        city: "Aarhus",
        cvrData: { vat: 12345678, name: "Nordisk Kaffe ApS" },
      },
      "cvr",
    );
    companyB = await createCompany(CTX_B, { name: "B Industri A/S" }, "manual");

    const detail = await getCompanyDetail(CTX_A, companyA);
    expect(detail?.company.name).toBe("Nordisk Kaffe ApS");
    expect(detail?.company.cvrSyncedAt).not.toBeNull();
    expect(detail?.timeline.map((a) => a.type)).toContain("system");
  });

  it("lists and filters companies", async () => {
    const all = await listCompanies(CTX_A);
    expect(all.map((c) => c.name)).toContain("Nordisk Kaffe ApS");
    expect(all.map((c) => c.name)).not.toContain("B Industri A/S");

    const filtered = await listCompanies(CTX_A, "kaffe");
    expect(filtered).toHaveLength(1);
    const byCvr = await listCompanies(CTX_A, "123456");
    expect(byCvr).toHaveLength(1);
  });

  it("stage changes append a stage_change activity with from/to", async () => {
    await setPipelineStage(CTX_A, companyA, "dialogue");
    await setPipelineStage(CTX_A, companyA, "proposal");
    const detail = await getCompanyDetail(CTX_A, companyA);
    expect(detail?.company.pipelineStage).toBe("proposal");
    const changes = detail?.timeline.filter((a) => a.type === "stage_change") ?? [];
    expect(changes).toHaveLength(2);
    expect(changes[0]?.metadata).toMatchObject({ from: "dialogue", to: "proposal" });
  });

  it("setting the same stage twice does not spam the timeline", async () => {
    await setPipelineStage(CTX_A, companyA, "proposal");
    const detail = await getCompanyDetail(CTX_A, companyA);
    expect(detail?.timeline.filter((a) => a.type === "stage_change")).toHaveLength(2);
  });

  it("contacts: primary flag is exclusive per company", async () => {
    await addContact(CTX_A, companyA, { name: "Mette Møller", isPrimary: true });
    await addContact(CTX_A, companyA, { name: "Jens Jensen", isPrimary: true });
    const detail = await getCompanyDetail(CTX_A, companyA);
    const primary = detail?.contacts.filter((c) => c.isPrimary) ?? [];
    expect(detail?.contacts).toHaveLength(2);
    expect(primary).toHaveLength(1);
    expect(primary[0]?.name).toBe("Jens Jensen");
  });

  it("notes land on the timeline newest first", async () => {
    await addActivity(CTX_A, companyA, "note", "Ringede om rammeaftale.");
    const detail = await getCompanyDetail(CTX_A, companyA);
    expect(detail?.timeline[0]?.body).toBe("Ringede om rammeaftale.");
  });

  it("rejects attaching a contact or note to another org's company", async () => {
    await expect(addContact(CTX_A, companyB, { name: "Smugler" })).rejects.toThrow(
      "COMPANY_NOT_FOUND",
    );
    await expect(addActivity(CTX_A, companyB, "note", "smuglet")).rejects.toThrow(
      "COMPANY_NOT_FOUND",
    );
  });

  it("cannot read another org's company detail", async () => {
    expect(await getCompanyDetail(CTX_A, companyB)).toBeNull();
  });
});

describe("time tracking", () => {
  const MONDAY = "2026-08-24";

  it("adds entries and aggregates the week", async () => {
    await addEntry(CTX_A, {
      companyId: companyA,
      entryDate: "2026-08-24",
      durationMinutes: 90,
      note: "Workshopforberedelse",
    });
    await addEntry(CTX_A, { entryDate: "2026-08-26", durationMinutes: 30, note: "Intern tid" });
    await addEntry(CTX_A, { companyId: companyA, entryDate: "2026-08-30", durationMinutes: 60 });
    // Outside the week; must not count.
    await addEntry(CTX_A, { entryDate: "2026-08-31", durationMinutes: 500 });

    const week = await listWeek(CTX_A, MONDAY);
    expect(week).toHaveLength(3);
    expect(week[0]?.companyName).toBe("Nordisk Kaffe ApS");
    expect(week.find((e) => e.note === "Intern tid")?.companyName).toBeNull();
    expect(await weekTotalMinutes(CTX_A, MONDAY)).toBe(180);
  });

  it("tracked time shows up on the company detail", async () => {
    const detail = await getCompanyDetail(CTX_A, companyA);
    expect(detail?.trackedMinutes).toBe(150);
  });

  it("rejects tracking time on another org's company", async () => {
    await expect(
      addEntry(CTX_A, { companyId: companyB, entryDate: "2026-08-24", durationMinutes: 30 }),
    ).rejects.toThrow("COMPANY_NOT_FOUND");
  });

  it("only the owner can delete an entry", async () => {
    const week = await listWeek(CTX_A, MONDAY);
    const entry = week.find((e) => e.note === "Intern tid");
    expect(entry).toBeDefined();
    // Another member of the same org cannot delete it...
    expect(await deleteEntry({ orgId: ORG_A, userId: USER_A2 }, entry!.id)).toBe(false);
    // ...but the owner can.
    expect(await deleteEntry(CTX_A, entry!.id)).toBe(true);
    expect(await weekTotalMinutes(CTX_A, MONDAY)).toBe(150);
  });
});

describe("dashboard overview", () => {
  it("aggregates stages and recent activity", async () => {
    const overview = await getCrmOverview(CTX_A);
    const proposal = overview.stages.find((s) => s.stage === "proposal");
    expect(proposal?.count).toBe(1);
    expect(overview.latest.length).toBeGreaterThan(0);
    expect(overview.latest.every((a) => a.companyName !== "B Industri A/S")).toBe(true);
  });
});
