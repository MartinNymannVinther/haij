import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { withOrgContext } from "@/core/db/tenant";
import { allocateInvoiceNumber } from "@/modules/invoicing/numbering";
import { adminPool } from "../helpers/db";

/**
 * Fakturakrav: invoice numbers must be fortløbende — sequential with no
 * gaps and no duplicates, per organization. This exercises the real
 * allocation path (committed transactions on the application role),
 * including the two ways naive implementations break: rollbacks burning
 * numbers and concurrent issuance duplicating them.
 */

const ORG_1 = "org_numbering_1";
const ORG_2 = "org_numbering_2";
const USER = "user_numbering";
const CTX_1 = { orgId: ORG_1, userId: USER };
const CTX_2 = { orgId: ORG_2, userId: USER };

let admin: Pool;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Numbering 1', 'numbering-1', now()), ($2, 'Numbering 2', 'numbering-2', now())`,
    [ORG_1, ORG_2],
  );
  await admin.query(
    `insert into users (id, name, email) values ($1, 'N', 'numbering@example.com')`,
    [USER],
  );
});

afterAll(async () => {
  await admin?.end();
});

describe("allocateInvoiceNumber", () => {
  it("starts at 1 and increments without gaps", async () => {
    const first = await withOrgContext(CTX_1, (tx) => allocateInvoiceNumber(tx, ORG_1));
    const second = await withOrgContext(CTX_1, (tx) => allocateInvoiceNumber(tx, ORG_1));
    const third = await withOrgContext(CTX_1, (tx) => allocateInvoiceNumber(tx, ORG_1));
    expect([first, second, third]).toEqual([1, 2, 3]);
  });

  it("hands a rolled-back number out again (no gaps burned)", async () => {
    let seen = 0;
    await expect(
      withOrgContext(CTX_1, async (tx) => {
        seen = await allocateInvoiceNumber(tx, ORG_1);
        throw new Error("issue failed after allocation");
      }),
    ).rejects.toThrow("issue failed");
    const next = await withOrgContext(CTX_1, (tx) => allocateInvoiceNumber(tx, ORG_1));
    expect(next).toBe(seen);
  });

  it("keeps organizations on independent sequences", async () => {
    const other = await withOrgContext(CTX_2, (tx) => allocateInvoiceNumber(tx, ORG_2));
    expect(other).toBe(1);
  });

  it("never duplicates or skips under concurrent issuance", async () => {
    const before = await admin.query(`select next_number from invoice_counters where org_id = $1`, [
      ORG_1,
    ]);
    const start = before.rows[0].next_number as number;

    const allocated = await Promise.all(
      Array.from({ length: 8 }, () =>
        withOrgContext(CTX_1, (tx) => allocateInvoiceNumber(tx, ORG_1)),
      ),
    );

    const sorted = [...allocated].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 8 }, (_, i) => start + i));
    expect(new Set(allocated).size).toBe(8);
  });

  it("RLS refuses allocation against a foreign org", async () => {
    await expect(
      withOrgContext(CTX_1, (tx) => allocateInvoiceNumber(tx, ORG_2)),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });
});
