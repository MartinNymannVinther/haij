import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/** Tenant isolation for the signals engine tables. */

const ORG_A = "org_sig_a";
const ORG_B = "org_sig_b";
const USER_A = "user_sig_a";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Sig A', 'sig-a', now()), ($2, 'Sig B', 'sig-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'S', 'sig-a@example.com')`, [
    USER_A,
  ]);
  await admin.query(
    `insert into signal_settings (org_id, service_profile) values
       ($1, 'Digital strategi for SMV'), ($2, 'Regnskab')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into signals (id, org_id, source, source_ref, title, status) values
       ('sig_a', $1, 'rss', 'ref-a', 'Signal A', 'new'),
       ('sig_b', $2, 'rss', 'ref-b', 'Signal B', 'new')`,
    [ORG_A, ORG_B],
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

describe("read isolation", () => {
  it.each(["signals", "signal_settings"] as const)("%s: org A sees only its own", async (table) => {
    const rows = await asApp(app, CTX_A, (c) => c.query(`select org_id from ${table}`));
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].org_id).toBe(ORG_A);
  });
});

describe("write isolation", () => {
  it("cannot insert, update or delete for the foreign org", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into signals (org_id, source, source_ref, title) values ($1, 'manual', 'x', 'Smuglet')`,
          [ORG_B],
        ),
      ),
    );
    expect(code).toBe("42501");

    for (const sql of [
      `update signals set status = 'dismissed' where id = 'sig_b'`,
      `delete from signals where id = 'sig_b'`,
      `update signal_settings set service_profile = 'hacked' where org_id = '${ORG_B}'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("dedupe key holds per org: same source_ref in both orgs is fine", async () => {
    const result = await asApp(app, CTX_A, (c) =>
      c.query(
        `insert into signals (org_id, source, source_ref, title) values ($1, 'rss', 'ref-b', 'Egen med samme ref')`,
        [ORG_A],
      ),
    );
    expect(result.rowCount).toBe(1);
  });
});

describe("default deny without context", () => {
  it.each(["signals", "signal_settings"] as const)("%s: zero rows", async (table) => {
    const rows = await asApp(app, null, (c) => c.query(`select count(*)::int as n from ${table}`));
    expect(rows.rows[0].n).toBe(0);
  });
});
