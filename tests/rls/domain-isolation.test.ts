import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/**
 * Phase 1 acceptance: tenant isolation for the CRM and time-tracking
 * tables, proven with raw SQL as the application role. Unlike the phase-0
 * tables, haij_app has full CRUD here — so every verb must be shown to be
 * scoped to the active organization.
 */

const ORG_A = "org_domain_a";
const ORG_B = "org_domain_b";
const USER_A = "user_domain_a";
const USER_B = "user_domain_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Domain A', 'domain-a', now()), ($2, 'Domain B', 'domain-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Domain User A', 'domain-a@example.com'),
       ($2, 'Domain User B', 'domain-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into companies (id, org_id, name, cvr, pipeline_stage) values
       ('comp_a', $1, 'Kunde A ApS', '11111118', 'lead'),
       ('comp_b', $2, 'Kunde B A/S', '22222227', 'proposal')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into contacts (id, org_id, company_id, name) values
       ('cont_a', $1, 'comp_a', 'Kontakt A'),
       ('cont_b', $2, 'comp_b', 'Kontakt B')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into activities (id, org_id, company_id, type, body) values
       ('act_a', $1, 'comp_a', 'note', 'Note A'),
       ('act_b', $2, 'comp_b', 'note', 'Note B')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into time_entries (id, org_id, company_id, user_id, entry_date, duration_minutes) values
       ('time_a', $1, 'comp_a', $3, '2026-08-24', 90),
       ('time_b', $2, 'comp_b', $4, '2026-08-24', 120)`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

const TABLES = ["companies", "contacts", "activities", "time_entries"] as const;

describe("read isolation", () => {
  it.each(TABLES)("%s: org A sees only its own rows", async (table) => {
    const rows = await asApp(app, CTX_A, (c) => c.query(`select org_id from ${table}`));
    expect(rows.rowCount).toBeGreaterThan(0);
    expect(rows.rows.every((r) => r.org_id === ORG_A)).toBe(true);
  });

  it("cannot read org B's company even by primary key", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select id from companies where id = 'comp_b'"),
    );
    expect(rows.rowCount).toBe(0);
  });
});

describe("write isolation", () => {
  it.each(TABLES)("%s: inserting a row for org B is rejected", async (table) => {
    const inserts: Record<(typeof TABLES)[number], string> = {
      companies: `insert into companies (org_id, name) values ('${ORG_B}', 'Smuglet')`,
      contacts: `insert into contacts (org_id, company_id, name) values ('${ORG_B}', 'comp_b', 'Smuglet')`,
      activities: `insert into activities (org_id, company_id, type, body) values ('${ORG_B}', 'comp_b', 'note', 'Smuglet')`,
      time_entries: `insert into time_entries (org_id, company_id, user_id, entry_date, duration_minutes) values ('${ORG_B}', 'comp_b', '${USER_A}', '2026-08-24', 30)`,
    };
    const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(inserts[table])));
    expect(code).toBe("42501");
  });

  it("can insert rows for its own org", async () => {
    const result = await asApp(app, CTX_A, (c) =>
      c.query(`insert into companies (org_id, name, created_by) values ($1, 'Egen Kunde', $2)`, [
        ORG_A,
        USER_A,
      ]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("updates against org B's rows hit zero rows", async () => {
    for (const sql of [
      `update companies set name = 'hacked' where id = 'comp_b'`,
      `update contacts set name = 'hacked' where id = 'cont_b'`,
      `update activities set body = 'hacked' where id = 'act_b'`,
      `update time_entries set duration_minutes = 1 where id = 'time_b'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("deletes against org B's rows hit zero rows", async () => {
    for (const sql of [
      `delete from time_entries where id = 'time_b'`,
      `delete from activities where id = 'act_b'`,
      `delete from contacts where id = 'cont_b'`,
      `delete from companies where id = 'comp_b'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("cannot smuggle a row over to org B via update", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(c.query(`update companies set org_id = '${ORG_B}' where id = 'comp_a'`)),
    );
    expect(code).toBe("42501"); // WITH CHECK rejects the new row
  });
});

describe("default deny without context", () => {
  it.each(TABLES)("%s: zero rows", async (table) => {
    const rows = await asApp(app, null, (c) => c.query(`select count(*)::int as n from ${table}`));
    expect(rows.rows[0].n).toBe(0);
  });
});

describe("audit triggers cover the domain tables", () => {
  it("fixture inserts produced audit rows with the right org", async () => {
    const rows = await admin.query(
      `select action from audit_log where org_id = $1 and action like 'companies.%'`,
      [ORG_A],
    );
    expect(rows.rows.map((r) => r.action)).toContain("companies.insert");
  });
});
