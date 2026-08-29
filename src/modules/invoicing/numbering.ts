import { eq, sql } from "drizzle-orm";
import { auditLog, invoiceCounters, invoices } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";

/**
 * Allocates the next invoice number for the active organization —
 * fortløbende (gapless), as the fakturakrav require.
 *
 * A Postgres sequence would leave holes on rollback, so the counter is a
 * plain row updated inside the issuing transaction. The row lock taken by
 * the upsert serializes concurrent issuance per organization: a competing
 * transaction waits, and if the first one rolls back the number is handed
 * out again. No number is ever burned, none is ever issued twice.
 *
 * Runs as haij_app, so RLS pins the counter to the active org; call it
 * only inside the same transaction that flips the invoice to issued.
 */
export async function allocateInvoiceNumber(tx: AppTransaction, orgId: string): Promise<number> {
  const result = await tx.execute<{ allocated: number }>(sql`
    insert into invoice_counters (org_id, next_number)
    values (${orgId}, 2)
    on conflict (org_id) do update set next_number = invoice_counters.next_number + 1
    returning next_number - 1 as allocated
  `);
  const row = result.rows[0];
  if (!row) throw new Error("invoice number allocation returned no row");
  return Number(row.allocated);
}

/**
 * The number the next issued invoice will carry.
 */
export async function getNextInvoiceNumber(ctx: OrgContext): Promise<number> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ next: invoiceCounters.nextNumber })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.orgId, ctx.orgId))
      .limit(1);
    return row?.next ?? 1;
  });
}

/**
 * Moves the counter forward, so a business migrating in from another
 * system keeps its numbering unbroken across the switch. Only ever
 * forward: a number at or below one already issued would reuse it, and
 * bogføringsloven wants the sequence whole. A database trigger refuses a
 * decrease as well, so a bug here cannot rewind the counter either.
 *
 * The counter is not covered by a row-level audit trigger (every issued
 * invoice bumps it), so a semantic event is written here instead.
 */
export async function setNextInvoiceNumber(ctx: OrgContext, next: number): Promise<number> {
  if (!Number.isInteger(next) || next < 1) throw new Error("NUMBER_TOO_LOW");
  return withOrgContext(ctx, async (tx) => {
    const [current] = await tx
      .select({ next: invoiceCounters.nextNumber })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.orgId, ctx.orgId))
      .limit(1);
    const [highest] = await tx
      .select({ max: sql<number | null>`max(${invoices.invoiceNumber})` })
      .from(invoices);

    const floor = Math.max(current?.next ?? 1, (highest?.max ?? 0) + 1);
    if (next < floor) throw new Error("NUMBER_TOO_LOW");
    if (next === (current?.next ?? 1)) return next;

    await tx
      .insert(invoiceCounters)
      .values({ orgId: ctx.orgId, nextNumber: next })
      .onConflictDoUpdate({ target: invoiceCounters.orgId, set: { nextNumber: next } });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      actorType: "user",
      action: "invoice_counters.raised",
      entityType: "invoice_counter",
      entityId: ctx.orgId,
      after: { nextNumber: next },
      before: { nextNumber: current?.next ?? 1 },
    });
    return next;
  });
}
