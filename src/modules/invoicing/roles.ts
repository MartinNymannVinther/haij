import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { companies, projects, roleRates, roles } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * The org's role catalog and the rates agreed for those roles.
 *
 * A role is a name, nothing more: "Transformation Lead" costs what the
 * customer agreed it costs, so the price lives in `role_rates` bound to
 * one customer or one project. Deleting a role keeps the time entries and
 * clears the link (issued invoices carry their own frozen prices anyway)
 * and takes its rate agreements with it.
 */

export type Role = { id: string; name: string };

export type RoleRate = {
  id: string;
  roleId: string;
  roleName: string;
  hourlyRateOere: number;
};

export async function listRoles(ctx: OrgContext): Promise<Role[]> {
  return withOrgContext(ctx, (tx) =>
    tx.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name)),
  );
}

export async function createRole(ctx: OrgContext, name: string) {
  return withOrgContext(ctx, async (tx) => {
    const [created] = await tx
      .insert(roles)
      .values({ orgId: ctx.orgId, name })
      .returning({ id: roles.id });
    return created?.id ?? null;
  });
}

export async function updateRole(ctx: OrgContext, roleId: string, name: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(roles)
      .set({ name, updatedAt: new Date() })
      .where(eq(roles.id, roleId))
      .returning({ id: roles.id });
    return result.length > 0;
  });
}

export async function deleteRole(ctx: OrgContext, roleId: string) {
  return withOrgContext(ctx, async (tx) => {
    // time_entries.role_id is ON DELETE SET NULL: hours stay, link goes.
    // role_rates cascades: an agreement without a role means nothing.
    const result = await tx.delete(roles).where(eq(roles.id, roleId)).returning({ id: roles.id });
    return result.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Agreed rates, per customer or per project.                          */
/* ------------------------------------------------------------------ */

export async function listCompanyRoleRates(
  ctx: OrgContext,
  companyId: string,
): Promise<RoleRate[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: roleRates.id,
        roleId: roleRates.roleId,
        roleName: roles.name,
        hourlyRateOere: roleRates.hourlyRateOere,
      })
      .from(roleRates)
      .innerJoin(roles, eq(roles.id, roleRates.roleId))
      .where(eq(roleRates.companyId, companyId))
      .orderBy(asc(roles.name)),
  );
}

export async function listProjectRoleRates(
  ctx: OrgContext,
  projectId: string,
): Promise<RoleRate[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: roleRates.id,
        roleId: roleRates.roleId,
        roleName: roles.name,
        hourlyRateOere: roleRates.hourlyRateOere,
      })
      .from(roleRates)
      .innerJoin(roles, eq(roles.id, roleRates.roleId))
      .where(eq(roleRates.projectId, projectId))
      .orderBy(asc(roles.name)),
  );
}

export type RoleRateScope = { companyId: string } | { projectId: string };

/**
 * Creates or replaces the agreed rate for one role in one scope. The
 * partial unique indexes make (role, customer) and (role, project) single
 * rows, so this is an upsert rather than a stack of history.
 */
export async function setRoleRate(
  ctx: OrgContext,
  scope: RoleRateScope,
  roleId: string,
  hourlyRateOere: number,
): Promise<string | null> {
  if (!Number.isInteger(hourlyRateOere) || hourlyRateOere < 0) {
    throw new Error("RATE_INVALID");
  }
  return withOrgContext(ctx, async (tx) => {
    // RLS-scoped existence checks: foreign keys do not know about tenants,
    // and the database trigger is the belt to this pair of braces.
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId));
    if (!role) throw new Error("ROLE_NOT_FOUND");

    if ("companyId" in scope) {
      const [company] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, scope.companyId));
      if (!company) throw new Error("COMPANY_NOT_FOUND");
    } else {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, scope.projectId));
      if (!project) throw new Error("PROJECT_NOT_FOUND");
    }

    const where =
      "companyId" in scope
        ? and(eq(roleRates.roleId, roleId), eq(roleRates.companyId, scope.companyId))
        : and(eq(roleRates.roleId, roleId), eq(roleRates.projectId, scope.projectId));

    const updated = await tx
      .update(roleRates)
      .set({ hourlyRateOere, updatedAt: new Date() })
      .where(where)
      .returning({ id: roleRates.id });
    if (updated[0]) return updated[0].id;

    const [created] = await tx
      .insert(roleRates)
      .values({
        orgId: ctx.orgId,
        roleId,
        companyId: "companyId" in scope ? scope.companyId : null,
        projectId: "projectId" in scope ? scope.projectId : null,
        hourlyRateOere,
      })
      .returning({ id: roleRates.id });
    return created?.id ?? null;
  });
}

export async function deleteRoleRate(ctx: OrgContext, roleRateId: string): Promise<boolean> {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .delete(roleRates)
      .where(eq(roleRates.id, roleRateId))
      .returning({ id: roleRates.id });
    return result.length > 0;
  });
}

/**
 * Roles that have no agreed rate in the given scope — what the "add a
 * rate" picker should offer.
 */
export async function listRolesWithoutRate(ctx: OrgContext, scope: RoleRateScope): Promise<Role[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .leftJoin(
        roleRates,
        "companyId" in scope
          ? and(eq(roleRates.roleId, roles.id), eq(roleRates.companyId, scope.companyId))
          : and(eq(roleRates.roleId, roles.id), eq(roleRates.projectId, scope.projectId)),
      )
      .where(isNull(roleRates.id))
      .orderBy(asc(roles.name)),
  );
}

/**
 * The customer rate a project inherits when it has no agreement of its
 * own — shown as the placeholder on the project page so it is clear what
 * is inherited and what is overridden.
 */
export async function listInheritedRoleRates(
  ctx: OrgContext,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .select({ roleId: roleRates.roleId, hourlyRateOere: roleRates.hourlyRateOere })
      .from(roleRates)
      .where(
        sql`${roleRates.companyId} = (select company_id from projects where id = ${projectId})`,
      ),
  );
  return new Map(rows.map((row) => [row.roleId, Number(row.hourlyRateOere)]));
}
