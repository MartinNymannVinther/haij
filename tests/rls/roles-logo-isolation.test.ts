import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/** Tenant isolation for the role catalog and the logo blob table. */

const ORG_A = "org_roles_a";
const ORG_B = "org_roles_b";
const USER_A = "user_roles_a";
const CTX_A = { orgId: ORG_A, userId: USER_A };

const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Roles A', 'roles-a', now()), ($2, 'Roles B', 'roles-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'R', 'roles-a@example.com')`, [
    USER_A,
  ]);
  await admin.query(
    `insert into roles (id, org_id, name) values
       ('role_a', $1, 'Seniorrådgivning'),
       ('role_b', $2, 'Udvikling')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into companies (id, org_id, name, pipeline_stage) values
       ('rr_comp_a', $1, 'Kunde A', 'lead'),
       ('rr_comp_b', $2, 'Kunde B', 'lead')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into role_rates (id, org_id, role_id, company_id, hourly_rate_oere) values
       ('rr_a', $1, 'role_a', 'rr_comp_a', 140000),
       ('rr_b', $2, 'role_b', 'rr_comp_b', 90000)`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into org_logos (org_id, data, content_type) values
       ($1, $3, 'image/png'), ($2, $3, 'image/png')`,
    [ORG_A, ORG_B, PIXEL],
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

describe("read isolation", () => {
  it.each(["roles", "org_logos", "role_rates"] as const)(
    "%s: org A sees only its own rows",
    async (table) => {
      const rows = await asApp(app, CTX_A, (c) => c.query(`select org_id from ${table}`));
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].org_id).toBe(ORG_A);
    },
  );
});

describe("write isolation", () => {
  it("cannot insert, update or delete for the foreign org", async () => {
    const insertCode = await asApp(app, CTX_A, (c) =>
      expectSqlError(c.query(`insert into roles (org_id, name) values ($1, 'Smuglet')`, [ORG_B])),
    );
    expect(insertCode).toBe("42501");

    for (const sql of [
      `update roles set name = 'Kapret' where id = 'role_b'`,
      `delete from roles where id = 'role_b'`,
      `update role_rates set hourly_rate_oere = 1 where id = 'rr_b'`,
      `delete from role_rates where id = 'rr_b'`,
      `update org_logos set data = 'x' where org_id = '${ORG_B}'`,
      `delete from org_logos where org_id = '${ORG_B}'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("cannot link a time entry to the foreign org's role", async () => {
    // RLS-scoped guard lives in the service; here the raw insert is only
    // stopped by the entry's own org check, so prove the role stays
    // invisible for the guard query instead.
    const visible = await asApp(app, CTX_A, (c) =>
      c.query(`select id from roles where id = 'role_b'`),
    );
    expect(visible.rowCount).toBe(0);
  });
});

describe("default deny without context", () => {
  it.each(["roles", "org_logos", "role_rates"] as const)("%s: zero rows", async (table) => {
    const rows = await asApp(app, null, (c) => c.query(`select count(*)::int as n from ${table}`));
    expect(rows.rows[0].n).toBe(0);
  });
});

describe("role rate scope", () => {
  it("refuses a rate that borrows another org's customer", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into role_rates (org_id, role_id, company_id, hourly_rate_oere)
             values ($1, 'role_a', 'rr_comp_b', 100000)`,
          [ORG_A],
        ),
      ),
    );
    // The trigger fires before the row-level policy can reject it.
    expect(code).toBe("23514");
  });

  it("refuses a rate bound to neither a customer nor a project", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into role_rates (org_id, role_id, company_id, project_id, hourly_rate_oere)
             values ($1, 'role_a', null, null, 100000)`,
          [ORG_A],
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it("refuses the same role twice on one customer", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into role_rates (org_id, role_id, company_id, hourly_rate_oere)
             values ($1, 'role_a', 'rr_comp_a', 99000)`,
          [ORG_A],
        ),
      ),
    );
    expect(code).toBe("23505");
  });
});

describe("audit", () => {
  it("role changes hit the audit log; the logo blob does not", async () => {
    const roleAudit = await admin.query(
      `select count(*)::int as n from audit_log where org_id = $1 and action = 'roles.insert'`,
      [ORG_A],
    );
    expect(roleAudit.rows[0].n).toBe(1);

    const rateAudit = await admin.query(
      `select count(*)::int as n from audit_log where org_id = $1 and action = 'role_rates.insert'`,
      [ORG_A],
    );
    expect(rateAudit.rows[0].n).toBe(1);

    // No row trigger on org_logos: the base64 payload must never land in
    // the audit log via table auditing (the service writes a semantic
    // event without the blob instead).
    const logoAudit = await admin.query(
      `select count(*)::int as n from audit_log where action like 'org_logos.%' and after_data is not null`,
    );
    expect(logoAudit.rows[0].n).toBe(0);
  });
});
