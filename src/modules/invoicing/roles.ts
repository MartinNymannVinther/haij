import { asc, eq } from "drizzle-orm";
import { roles } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * The org's role catalog: named hourly rates (øre excl. VAT) picked per
 * time entry. A role wins the rate resolution for its entries; deleting
 * one keeps the entries and clears the link (historic invoices carry
 * their own frozen prices anyway).
 */

export async function listRoles(ctx: OrgContext) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({ id: roles.id, name: roles.name, hourlyRateOere: roles.hourlyRateOere })
      .from(roles)
      .orderBy(asc(roles.name)),
  );
}

export async function createRole(ctx: OrgContext, name: string, hourlyRateOere: number) {
  return withOrgContext(ctx, async (tx) => {
    const [created] = await tx
      .insert(roles)
      .values({ orgId: ctx.orgId, name, hourlyRateOere })
      .returning({ id: roles.id });
    return created?.id ?? null;
  });
}

export async function updateRole(
  ctx: OrgContext,
  roleId: string,
  name: string,
  hourlyRateOere: number,
) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(roles)
      .set({ name, hourlyRateOere, updatedAt: new Date() })
      .where(eq(roles.id, roleId))
      .returning({ id: roles.id });
    return result.length > 0;
  });
}

export async function deleteRole(ctx: OrgContext, roleId: string) {
  return withOrgContext(ctx, async (tx) => {
    // time_entries.role_id is ON DELETE SET NULL: hours stay, link goes.
    const result = await tx.delete(roles).where(eq(roles.id, roleId)).returning({ id: roles.id });
    return result.length > 0;
  });
}
