import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/**
 * Phase 2 acceptance: tenant isolation for the invoicing and budget tables,
 * plus the bogføringsloven immutability rules — once an invoice has left
 * draft, nothing but its status flow may change, not even for a superuser.
 */

const ORG_A = "org_inv_a";
const ORG_B = "org_inv_b";
const ORG_C = "org_inv_c"; // exists, but has no rows in the phase-2 tables
const USER_A = "user_inv_a";
const USER_B = "user_inv_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Invoice A', 'invoice-a', now()),
       ($2, 'Invoice B', 'invoice-b', now()),
       ($3, 'Invoice C', 'invoice-c', now())`,
    [ORG_A, ORG_B, ORG_C],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Invoice User A', 'invoice-a@example.com'),
       ($2, 'Invoice User B', 'invoice-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into org_profiles (org_id, legal_name, cvr, address, zipcode, city) values
       ($1, 'Konsulent A ApS', '11111118', 'Agade 1', '8000', 'Aarhus C'),
       ($2, 'Konsulent B ApS', '22222227', 'Bgade 2', '2100', 'København Ø')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into invoice_counters (org_id, next_number) values ($1, 5), ($2, 9)`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into budgets (id, org_id, year, month, revenue_target_oere) values
       ('budget_a', $1, 2026, 9, 10000000),
       ('budget_b', $2, 2026, 9, 20000000)`,
    [ORG_A, ORG_B],
  );

  // Invoices must be born as drafts: the line-immutability trigger blocks
  // seeding lines under an already-issued invoice, superuser or not.
  await admin.query(
    `insert into invoices (id, org_id, status, buyer_name, note) values
       ('inv_a_draft', $1, 'draft', 'Kunde A', 'draft A'),
       ('inv_a_issued', $1, 'draft', 'Kunde A', 'issued A'),
       ('inv_b_issued', $2, 'draft', 'Kunde B', 'issued B')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into invoice_lines
       (id, org_id, invoice_id, description, quantity_hundredths, unit_price_oere, line_net_oere, line_vat_oere) values
       ('line_a_draft', $1, 'inv_a_draft', 'Rådgivning', 150, 120000, 180000, 45000),
       ('line_a_issued', $1, 'inv_a_issued', 'Rådgivning', 100, 120000, 120000, 30000),
       ('line_b', $2, 'inv_b_issued', 'Rådgivning', 100, 100000, 100000, 25000)`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `update invoices set status = 'issued', invoice_number = 1001, invoice_date = '2026-08-25',
       net_oere = 120000, vat_oere = 30000, gross_oere = 150000, issued_at = now()
     where id = 'inv_a_issued'`,
  );
  await admin.query(
    `update invoices set status = 'issued', invoice_number = 2001, invoice_date = '2026-08-25',
       net_oere = 100000, vat_oere = 25000, gross_oere = 125000, issued_at = now()
     where id = 'inv_b_issued'`,
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

const TABLES = ["org_profiles", "invoice_counters", "invoices", "invoice_lines", "budgets"] as const;

describe("read isolation", () => {
  it.each(TABLES)("%s: org A sees only its own rows", async (table) => {
    const rows = await asApp(app, CTX_A, (c) => c.query(`select org_id from ${table}`));
    expect(rows.rowCount).toBeGreaterThan(0);
    expect(rows.rows.every((r) => r.org_id === ORG_A)).toBe(true);
  });

  it("cannot read org B's issued invoice even by primary key or number", async () => {
    const byId = await asApp(app, CTX_A, (c) =>
      c.query(`select id from invoices where id = 'inv_b_issued'`),
    );
    expect(byId.rowCount).toBe(0);
    const byNumber = await asApp(app, CTX_A, (c) =>
      c.query(`select id from invoices where invoice_number = 2001`),
    );
    expect(byNumber.rowCount).toBe(0);
  });
});

describe("write isolation", () => {
  it.each(TABLES)("%s: inserting a row for a foreign org is rejected", async (table) => {
    const inserts: Record<(typeof TABLES)[number], string> = {
      org_profiles: `insert into org_profiles (org_id, legal_name, cvr, address, zipcode, city)
         values ('${ORG_C}', 'Smuglet', '33333335', 'X', '1234', 'X')`,
      invoice_counters: `insert into invoice_counters (org_id, next_number) values ('${ORG_C}', 1)`,
      invoices: `insert into invoices (org_id, status) values ('${ORG_C}', 'draft')`,
      invoice_lines: `insert into invoice_lines
         (org_id, invoice_id, description, quantity_hundredths, unit_price_oere, line_net_oere, line_vat_oere)
         values ('${ORG_B}', 'inv_b_issued', 'Smuglet', 100, 1, 1, 0)`,
      budgets: `insert into budgets (org_id, year, month, revenue_target_oere)
         values ('${ORG_C}', 2026, 10, 1)`,
    };
    const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(inserts[table])));
    expect(code).toBe("42501");
  });

  it("can insert rows for its own org", async () => {
    await asApp(app, CTX_A, async (c) => {
      const invoice = await c.query(
        `insert into invoices (id, org_id, status, created_by) values ('inv_a_new', $1, 'draft', $2)`,
        [ORG_A, USER_A],
      );
      expect(invoice.rowCount).toBe(1);
      const line = await c.query(
        `insert into invoice_lines
           (org_id, invoice_id, description, quantity_hundredths, unit_price_oere, line_net_oere, line_vat_oere)
         values ($1, 'inv_a_new', 'Egen linje', 100, 100000, 100000, 25000)`,
        [ORG_A],
      );
      expect(line.rowCount).toBe(1);
      const budget = await c.query(
        `insert into budgets (org_id, year, month, revenue_target_oere) values ($1, 2026, 10, 1)`,
        [ORG_A],
      );
      expect(budget.rowCount).toBe(1);
    });
  });

  it("updates against org B's rows hit zero rows", async () => {
    for (const sql of [
      `update org_profiles set legal_name = 'hacked' where org_id = '${ORG_B}'`,
      `update invoice_counters set next_number = 999 where org_id = '${ORG_B}'`,
      `update invoices set note = 'hacked' where id = 'inv_b_issued'`,
      `update invoice_lines set description = 'hacked' where id = 'line_b'`,
      `update budgets set revenue_target_oere = 1 where id = 'budget_b'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("deletes against org B's rows hit zero rows", async () => {
    for (const sql of [
      `delete from invoice_lines where id = 'line_b'`,
      `delete from invoices where id = 'inv_b_issued'`,
      `delete from org_profiles where org_id = '${ORG_B}'`,
      `delete from invoice_counters where org_id = '${ORG_B}'`,
      `delete from budgets where id = 'budget_b'`,
    ]) {
      const result = await asApp(app, CTX_A, (c) => c.query(sql));
      expect(result.rowCount, sql).toBe(0);
    }
  });

  it("cannot smuggle a draft invoice over to another org via update", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(c.query(`update invoices set org_id = '${ORG_B}' where id = 'inv_a_draft'`)),
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

describe("invoice immutability after issue", () => {
  it("drafts stay fully editable and deletable", async () => {
    await asApp(app, CTX_A, async (c) => {
      const update = await c.query(`update invoices set note = 'redigeret' where id = 'inv_a_draft'`);
      expect(update.rowCount).toBe(1);
      // Deleting a draft cascades to its lines; both triggers must allow it.
      const del = await c.query(`delete from invoices where id = 'inv_a_draft'`);
      expect(del.rowCount).toBe(1);
    });
  });

  it("a draft cannot be issued without number and date", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(c.query(`update invoices set status = 'issued' where id = 'inv_a_draft'`)),
    );
    expect(code).toBe("23514"); // invoices_issued_have_number
  });

  it("amounts, parties and dates of an issued invoice are frozen", async () => {
    for (const sql of [
      `update invoices set net_oere = 1 where id = 'inv_a_issued'`,
      `update invoices set buyer_name = 'Anden Kunde' where id = 'inv_a_issued'`,
      `update invoices set invoice_number = 4242 where id = 'inv_a_issued'`,
      `update invoices set invoice_date = '2026-01-01' where id = 'inv_a_issued'`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("P0001");
    }
  });

  it("an issued invoice cannot be deleted", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(c.query(`delete from invoices where id = 'inv_a_issued'`)),
    );
    expect(code).toBe("P0001");
  });

  it("follows the status flow issued -> sent and never backwards", async () => {
    await asApp(app, CTX_A, async (c) => {
      const sent = await c.query(
        `update invoices set status = 'sent', sent_at = now(), updated_at = now()
         where id = 'inv_a_issued'`,
      );
      expect(sent.rowCount).toBe(1);
      const backwards = await expectSqlError(
        c.query(`update invoices set status = 'issued' where id = 'inv_a_issued'`),
      );
      expect(backwards).toBe("P0001");
    });
  });

  it("can be marked paid directly from issued, and paid is terminal", async () => {
    await asApp(app, CTX_A, async (c) => {
      const paid = await c.query(
        `update invoices set status = 'paid', paid_at = now(), updated_at = now()
         where id = 'inv_a_issued'`,
      );
      expect(paid.rowCount).toBe(1);
      const reopened = await expectSqlError(
        c.query(`update invoices set status = 'sent' where id = 'inv_a_issued'`),
      );
      expect(reopened).toBe("P0001");
    });
  });

  it("lines of an issued invoice reject insert, update and delete", async () => {
    for (const sql of [
      `insert into invoice_lines
         (org_id, invoice_id, description, quantity_hundredths, unit_price_oere, line_net_oere, line_vat_oere)
       values ('${ORG_A}', 'inv_a_issued', 'Ekstra', 100, 1, 1, 0)`,
      `update invoice_lines set line_net_oere = 1 where id = 'line_a_issued'`,
      `delete from invoice_lines where id = 'line_a_issued'`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("P0001");
    }
  });

  it("even a superuser cannot change or delete an issued invoice", async () => {
    expect(
      await expectSqlError(admin.query(`update invoices set net_oere = 1 where id = 'inv_a_issued'`)),
    ).toBe("P0001");
    expect(await expectSqlError(admin.query(`delete from invoices where id = 'inv_a_issued'`))).toBe(
      "P0001",
    );
    expect(
      await expectSqlError(
        admin.query(`update invoice_lines set line_net_oere = 1 where id = 'line_a_issued'`),
      ),
    ).toBe("P0001");
  });
});

describe("audit triggers cover the invoicing tables", () => {
  it("fixture writes produced audit rows with the right org", async () => {
    const rows = await admin.query(
      `select distinct action from audit_log where org_id = $1 and action like 'invoice%'`,
      [ORG_A],
    );
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toContain("invoices.insert");
    expect(actions).toContain("invoices.update");
    expect(actions).toContain("invoice_lines.insert");
  });
});
