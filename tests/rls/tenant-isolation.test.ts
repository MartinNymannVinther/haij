import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, authClient, expectSqlError } from "../helpers/db";

/**
 * The acceptance criteria for phase 0: tenant isolation proven at the
 * database level. Everything here talks raw SQL as the runtime roles —
 * exactly what any application bug would be able to do, and no more.
 */

const ORG_A = "org_isolation_a";
const ORG_B = "org_isolation_b";
const USER_A = "user_isolation_a";
const USER_B = "user_isolation_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;
let auth: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  auth = await authClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Isolation A', 'isolation-a', now()),
       ($2, 'Isolation B', 'isolation-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'User A', 'isolation-a@example.com'),
       ($2, 'User B', 'isolation-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into memberships (id, organization_id, user_id, role, created_at) values
       ('mem_isolation_a', $1, $3, 'owner', now()),
       ('mem_isolation_b', $2, $4, 'owner', now())`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
  await admin.query(
    `insert into audit_log (org_id, actor_user_id, actor_type, action, entity_type, entity_id)
     values ($1, $3, 'user', 'test.seed', 'test', 'seed-a'),
            ($2, $4, 'user', 'test.seed', 'test', 'seed-b')`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
});

afterAll(async () => {
  await app?.end();
  await auth?.end();
  await admin?.end();
});

describe("read isolation (application role)", () => {
  it("only sees organizations the user belongs to or has active", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select id from organizations order by id"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([ORG_A]);
  });

  it("cannot read org B's organization row even by primary key", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select id from organizations where id = $1", [ORG_B]),
    );
    expect(rows.rowCount).toBe(0);
  });

  it("cannot read org B's memberships", async () => {
    const rows = await asApp(app, CTX_A, (c) => c.query("select organization_id from memberships"));
    expect(rows.rows.every((r) => r.organization_id === ORG_A)).toBe(true);
    expect(rows.rowCount).toBeGreaterThan(0);
  });

  it("only sees its own user row", async () => {
    const rows = await asApp(app, CTX_A, (c) => c.query("select id from users"));
    expect(rows.rows.map((r) => r.id)).toEqual([USER_A]);
  });

  it("only sees audit entries for the active organization", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select distinct org_id from audit_log where org_id is not null"),
    );
    expect(rows.rows.map((r) => r.org_id)).toEqual([ORG_A]);
  });
});

describe("write isolation (application role)", () => {
  it("cannot insert audit entries for another organization", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into audit_log (org_id, actor_user_id, actor_type, action, entity_type)
           values ($1, $2, 'user', 'test.forged', 'test')`,
          [ORG_B, USER_A],
        ),
      ),
    );
    expect(code).toBe("42501"); // row-level security violation
  });

  it("can insert audit entries for its own organization", async () => {
    const result = await asApp(app, CTX_A, (c) =>
      c.query(
        `insert into audit_log (org_id, actor_user_id, actor_type, action, entity_type)
         values ($1, $2, 'user', 'test.own', 'test') returning id`,
        [ORG_A, USER_A],
      ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("has no update/delete/insert privilege on organizations at all", async () => {
    for (const sql of [
      `update organizations set name = 'hacked' where id = '${ORG_B}'`,
      `update organizations set name = 'hacked' where id = '${ORG_A}'`,
      `delete from organizations where id = '${ORG_B}'`,
      `insert into organizations (id, name, slug, created_at) values ('org_x', 'X', 'x-slug', now())`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501"); // permission denied
    }
  });

  it("cannot touch memberships or users", async () => {
    for (const sql of [
      `update users set name = 'hacked' where id = '${USER_B}'`,
      `delete from memberships where id = 'mem_isolation_b'`,
      `insert into memberships (id, organization_id, user_id, role, created_at)
         values ('mem_forged', '${ORG_B}', '${USER_A}', 'owner', now())`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501");
    }
  });
});

describe("default deny without tenant context", () => {
  it.each(["organizations", "users", "memberships", "audit_log"])(
    "sees zero rows in %s",
    async (table) => {
      const rows = await asApp(app, null, (c) =>
        c.query(`select count(*)::int as n from ${table}`),
      );
      expect(rows.rows[0].n).toBe(0);
    },
  );
});

describe("credential tables are unreachable for the application role", () => {
  it.each(["accounts", "sessions", "verifications", "passkeys", "two_factors", "rate_limits"])(
    "select on %s is denied",
    async (table) => {
      const code = await asApp(app, CTX_A, (c) =>
        expectSqlError(c.query(`select * from ${table}`)),
      );
      expect(code).toBe("42501");
    },
  );
});

describe("audit_log is append-only", () => {
  it("application role cannot update or delete", async () => {
    for (const sql of ["update audit_log set action = 'x'", "delete from audit_log"]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501");
    }
  });

  it("even a superuser cannot update, delete or truncate", async () => {
    expect(await expectSqlError(admin.query("update audit_log set action = 'x' where true"))).toBe(
      "P0001",
    );
    expect(await expectSqlError(admin.query("delete from audit_log where true"))).toBe("P0001");
    expect(await expectSqlError(admin.query("truncate audit_log"))).toBe("P0001");
  });
});

describe("auth role confinement", () => {
  it("can read auth tables (its job)", async () => {
    const rows = await auth.query("select count(*)::int as n from users");
    expect(rows.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("can only append to the audit log, never read it", async () => {
    // No RETURNING: the auth role has INSERT but deliberately no SELECT.
    const insert = await auth.query(
      `insert into audit_log (org_id, actor_type, action, entity_type)
       values (null, 'system', 'test.auth-role', 'test')`,
    );
    expect(insert.rowCount).toBe(1);
    expect(await expectSqlError(auth.query("select * from audit_log"))).toBe("42501");
    const written = await admin.query(
      "select count(*)::int as n from audit_log where action = 'test.auth-role'",
    );
    expect(written.rows[0].n).toBe(1);
  });
});

describe("rls coverage (guards future tables)", () => {
  it("every table in public has row level security enabled AND forced", async () => {
    const rows = await admin.query(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
         and not (relrowsecurity and relforcerowsecurity)`,
    );
    expect(rows.rows.map((r) => r.relname)).toEqual([]);
  });

  it("runtime roles cannot bypass rls", async () => {
    const rows = await admin.query(
      `select rolname from pg_roles
       where rolname in ('haij_app', 'haij_auth') and (rolbypassrls or rolsuper)`,
    );
    expect(rows.rows).toEqual([]);
  });
});
