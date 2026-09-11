import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/** Tenant isolation for the per-user time settings. */

const ORG_A = "org_ts_a";
const ORG_B = "org_ts_b";
const USER_A = "user_ts_a";
const USER_B = "user_ts_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'TS A', 'ts-a', now()), ($2, 'TS B', 'ts-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'A', 'ts-a@example.com'), ($2, 'B', 'ts-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into user_time_settings (id, org_id, user_id, prefill_from_last_entry) values
       ('uts_a', $1, $3, false), ('uts_b', $2, $4, false)`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

describe("user_time_settings", () => {
  it("org A sees only its own row", async () => {
    const rows = await asApp(app, CTX_A, (c) => c.query(`select org_id from user_time_settings`));
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].org_id).toBe(ORG_A);
  });

  it("cannot insert for the foreign org", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into user_time_settings (org_id, user_id, prefill_from_last_entry)
             values ($1, $2, true)`,
          [ORG_B, USER_B],
        ),
      ),
    );
    expect(code).toBe("42501");
  });

  it("cannot update or delete the foreign org's row", async () => {
    for (const sql of [
      `update user_time_settings set prefill_from_last_entry = true where id = 'uts_b'`,
      `delete from user_time_settings where id = 'uts_b'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("the same user may hold one row per organization", async () => {
    await admin.query(
      `insert into user_time_settings (id, org_id, user_id, prefill_from_last_entry)
         values ('uts_a_in_b', $1, $2, true)`,
      [ORG_B, USER_A],
    );
    const rows = await admin.query(
      `select count(*)::int as count from user_time_settings where user_id = $1`,
      [USER_A],
    );
    expect(rows.rows[0].count).toBe(2);
    await admin.query(`delete from user_time_settings where id = 'uts_a_in_b'`);
  });
});
