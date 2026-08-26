import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createCompany } from "@/modules/crm/service";
import { upsertOrgProfile } from "@/modules/invoicing/profile";
import {
  addTask,
  createProject,
  deleteProject,
  deleteTask,
  getProjectDetail,
  listActiveProjectsForPicker,
  listProjects,
  setProjectStatus,
  setTaskDone,
  updateProject,
} from "@/modules/projects/service";
import { addEntry } from "@/modules/time/service";
import { adminPool } from "../helpers/db";

/**
 * Phase 3 flow through the real services: project -> tasks -> linked
 * time -> consumption against the frame. Org B proves cross-tenant
 * references fail.
 */

const ORG_A = "org_flow_proj_a";
const ORG_B = "org_flow_proj_b";
const USER_A = "user_flow_proj_a";
const USER_B = "user_flow_proj_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };
const CTX_B = { orgId: ORG_B, userId: USER_B };

let admin: Pool;
let companyA: string;
let projectId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Flow Proj A', 'flow-proj-a', now()), ($2, 'Flow Proj B', 'flow-proj-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Proj A', 'flow-proj-a@example.com'), ($2, 'Proj B', 'flow-proj-b@example.com')`,
    [USER_A, USER_B],
  );
  companyA = await createCompany(CTX_A, { name: "Projektkunde ApS" }, "manual");
  await upsertOrgProfile(CTX_A, {
    legalName: "Proj Org A",
    cvr: "55555559",
    address: "Vej 1",
    zipcode: "8000",
    city: "Aarhus C",
    defaultHourlyRateOere: 100000, // 1.000 kr/t default
  });
});

afterAll(async () => {
  await admin?.end();
});

describe("projects", () => {
  it("creates a project with frames and lists it with zero consumption", async () => {
    projectId = await createProject(CTX_A, {
      name: "Ny platform",
      companyId: companyA,
      description: "Discovery og MVP",
      budgetMinutes: 600, // 10 timer
      budgetAmountOere: 1000000, // 10.000 kr.
      deadline: "2026-10-01",
    });
    const rows = await listProjects(CTX_A);
    const row = rows.find((r) => r.id === projectId);
    expect(row).toMatchObject({
      name: "Ny platform",
      status: "active",
      companyName: "Projektkunde ApS",
      budgetMinutes: 600,
      trackedMinutes: 0,
      trackedValueOere: 0,
      openTasks: 0,
    });
  });

  it("rejects a foreign company on create and update", async () => {
    await expect(
      createProject(CTX_B, { name: "Smuglet", companyId: companyA }),
    ).rejects.toThrow("COMPANY_NOT_FOUND");
    await expect(
      updateProject(CTX_B, projectId, { name: "Kapret" }),
    ).rejects.toThrow("PROJECT_NOT_FOUND");
  });

  it("tracks tasks with done state and ordering", async () => {
    await addTask(CTX_A, projectId, { title: "Kickoff-møde" });
    await addTask(CTX_A, projectId, { title: "Skitse af datamodel", dueDate: "2026-09-04" });
    const detail = await getProjectDetail(CTX_A, projectId);
    expect(detail?.tasks.map((t) => t.title)).toEqual(["Kickoff-møde", "Skitse af datamodel"]);

    const first = detail!.tasks[0]!;
    await setTaskDone(CTX_A, first.id, true);
    const after = await getProjectDetail(CTX_A, projectId);
    // Done tasks sink to the bottom.
    expect(after?.tasks.map((t) => t.title)).toEqual(["Skitse af datamodel", "Kickoff-møde"]);
    expect(after?.tasks[1]?.isDone).toBe(true);
    expect(after?.tasks[1]?.doneAt).toBeTruthy();

    await deleteTask(CTX_A, first.id);
    expect((await getProjectDetail(CTX_A, projectId))?.tasks).toHaveLength(1);
    await addTask(CTX_A, projectId, { title: "Byg prototype" });
  });

  it("links time via the project and inherits the company", async () => {
    await addEntry(CTX_A, {
      projectId,
      entryDate: "2026-08-25",
      durationMinutes: 120,
      note: "Discovery",
    });
    await addEntry(CTX_A, {
      projectId,
      entryDate: "2026-08-26",
      durationMinutes: 60,
    });
    const detail = await getProjectDetail(CTX_A, projectId);
    expect(detail?.trackedMinutes).toBe(180);
    expect(detail?.unbilledMinutes).toBe(180);
    // Company inherited from the project on both entries.
    const linked = await admin.query(
      `select count(*)::int as n from time_entries where project_id = $1 and company_id = $2`,
      [projectId, companyA],
    );
    expect(linked.rows[0].n).toBe(2);
  });

  it("prices consumption at the org default rate when the company has none", async () => {
    const rows = await listProjects(CTX_A);
    const row = rows.find((r) => r.id === projectId);
    // 3 timer à 1.000 kr. = 3.000 kr.
    expect(row?.trackedMinutes).toBe(180);
    expect(row?.trackedValueOere).toBe(300000);
  });

  it("refuses linking time to a foreign or inactive project", async () => {
    await expect(
      addEntry(CTX_B, { projectId, entryDate: "2026-08-25", durationMinutes: 30 }),
    ).rejects.toThrow("PROJECT_NOT_FOUND");

    await setProjectStatus(CTX_A, projectId, "done");
    await expect(
      addEntry(CTX_A, { projectId, entryDate: "2026-08-26", durationMinutes: 30 }),
    ).rejects.toThrow("PROJECT_NOT_FOUND");
    await setProjectStatus(CTX_A, projectId, "active");
  });

  it("the picker only offers active projects", async () => {
    const otherId = await createProject(CTX_A, { name: "Gammelt projekt" });
    await setProjectStatus(CTX_A, otherId, "archived");
    const picker = await listActiveProjectsForPicker(CTX_A);
    expect(picker.some((p) => p.id === projectId)).toBe(true);
    expect(picker.some((p) => p.id === otherId)).toBe(false);
    expect(picker.find((p) => p.id === projectId)?.companyName).toBe("Projektkunde ApS");
  });

  it("deleting a project keeps the hours but drops the link", async () => {
    const doomedId = await createProject(CTX_A, { name: "Slettes", companyId: companyA });
    await addEntry(CTX_A, { projectId: doomedId, entryDate: "2026-08-26", durationMinutes: 45 });
    await addTask(CTX_A, doomedId, { title: "Ryger med" });
    expect(await deleteProject(CTX_A, doomedId)).toBe(true);

    const orphan = await admin.query(
      `select project_id, company_id, duration_minutes from time_entries
       where org_id = $1 and duration_minutes = 45`,
      [ORG_A],
    );
    expect(orphan.rows).toHaveLength(1);
    expect(orphan.rows[0].project_id).toBeNull();
    expect(orphan.rows[0].company_id).toBe(companyA);
    const tasksLeft = await admin.query(
      `select count(*)::int as n from tasks where org_id = $1 and title = 'Ryger med'`,
      [ORG_A],
    );
    expect(tasksLeft.rows[0].n).toBe(0);
  });

  it("cross-tenant reads come back empty", async () => {
    expect(await getProjectDetail(CTX_B, projectId)).toBeNull();
    expect((await listProjects(CTX_B)).some((r) => r.id === projectId)).toBe(false);
  });
});
