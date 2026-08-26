import { sql } from "drizzle-orm";
import type { AppTransaction } from "@/core/db/tenant";

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
