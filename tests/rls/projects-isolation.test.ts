import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/**
 * Phase 3 acceptance: tenant isolation for projects and tasks, proven
 * with raw SQL as the application role.
 */

const ORG_A = "org_proj_a";
const ORG_B = "org_proj_b";
const USER_A = "user_proj_a";
const USER_B = "user_proj_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Proj A', 'proj-a', now()), ($2, 'Proj B', 'proj-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Proj User A', 'proj-a@example.com'), ($2, 'Proj User B', 'proj-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into projects (id, org_id, name, status, budget_minutes) values
       ('proj_a', $1, 'Projekt A', 'active', 3000),
       ('proj_b', $2, 'Projekt B', 'active', 1200)`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into tasks (id, org_id, project_id, title) values
       ('task_a', $1, 'proj_a', 'Opgave A'),
       ('task_b', $2, 'proj_b', 'Opgave B')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into time_entries (id, org_id, user_id, project_id, entry_date, duration_minutes) values
       ('ptime_a', $1, $3, 'proj_a', '2026-08-25', 60),
       ('ptime_b', $2, $4, 'proj_b', '2026-08-25', 30)`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

const TABLES = ["projects", "tasks"] as const;

describe("read isolation", () => {
  it.each(TABLES)("%s: org A sees only its own rows", async (table) => {
    const rows = await asApp(app, CTX_A, (c) => c.query(`select org_id from ${table}`));
    expect(rows.rowCount).toBeGreaterThan(0);
    expect(rows.rows.every((r) => r.org_id === ORG_A)).toBe(true);
  });

  it("cannot read org B's project even by primary key", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query(`select id from projects where id = 'proj_b'`),
    );
    expect(rows.rowCount).toBe(0);
  });
});

describe("write isolation", () => {
  it("inserting rows for org B is rejected", async () => {
    for (const sql of [
      `insert into projects (org_id, name) values ('${ORG_B}', 'Smuglet')`,
      `insert into tasks (org_id, project_id, title) values ('${ORG_B}', 'proj_b', 'Smuglet')`,
      `insert into time_entries (org_id, user_id, project_id, entry_date, duration_minutes)
         values ('${ORG_B}', '${USER_A}', 'proj_b', '2026-08-25', 15)`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501");
    }
  });

  it("updates and deletes against org B's rows hit zero rows", async () => {
    for (const sql of [
      `update projects set name = 'hacked' where id = 'proj_b'`,
      `update tasks set title = 'hacked' where id = 'task_b'`,
      `delete from tasks where id = 'task_b'`,
      `delete from projects where id = 'proj_b'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("cannot smuggle a project over to org B via update", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(c.query(`update projects set org_id = '${ORG_B}' where id = 'proj_a'`)),
    );
    expect(code).toBe("42501");
  });
});

describe("default deny without context", () => {
  it.each(TABLES)("%s: zero rows", async (table) => {
    const rows = await asApp(app, null, (c) => c.query(`select count(*)::int as n from ${table}`));
    expect(rows.rows[0].n).toBe(0);
  });
});

describe("audit triggers cover projects and tasks", () => {
  it("fixture inserts produced audit rows with the right org", async () => {
    const rows = await admin.query(
      `select distinct action from audit_log where org_id = $1 and action like 'project%' or org_id = $1 and action like 'task%'`,
      [ORG_A],
    );
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toContain("projects.insert");
    expect(actions).toContain("tasks.insert");
  });
});
