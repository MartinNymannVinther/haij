import { sql } from "drizzle-orm";
import { appDb } from "./client";

export type OrgContext = {
  orgId: string;
  userId: string;
};

export type AppTransaction = Parameters<Parameters<typeof appDb.transaction>[0]>[0];

/**
 * Runs `fn` inside a transaction on the application role with the tenant
 * context set for RLS. Every domain query MUST go through this helper (or a
 * service built on it); outside of it the application role sees zero rows.
 *
 * `set_config(..., true)` is transaction-local, so the context can never leak
 * to another request sharing the pooled connection.
 */
export async function withOrgContext<T>(
  ctx: OrgContext,
  fn: (tx: AppTransaction) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${ctx.orgId}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    );
    return fn(tx);
  });
}
