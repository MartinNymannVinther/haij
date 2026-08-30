import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { companies, projects, roleRates, tasks, timeEntries } from "@/core/db/schema";

/**
 * Hourly-rate resolution for a time entry. All rates are øre EXCLUDING
 * VAT. The most specific agreement wins:
 *
 *   role rate on the project
 *     -> role rate on the customer
 *       -> task -> project -> customer -> org default
 *
 * A role carries no price of its own: what a role costs depends on who is
 * buying, so the rate is agreed per customer and may be overridden on a
 * single project. A role without an agreement is just a label on the hour
 * and the price falls through to the ordinary rates below it.
 *
 * A customer agreement outranks a task rate on purpose: what is agreed
 * with the customer weighs more than a note on one task (decided with
 * Martin, 2026-08-29).
 */
export type RateSources = {
  projectRoleRateOere?: number | null;
  companyRoleRateOere?: number | null;
  taskRateOere?: number | null;
  projectRateOere?: number | null;
  companyRateOere?: number | null;
  orgDefaultRateOere?: number | null;
};

export function resolveHourlyRateOere(sources: RateSources): number {
  return (
    sources.projectRoleRateOere ??
    sources.companyRoleRateOere ??
    sources.taskRateOere ??
    sources.projectRateOere ??
    sources.companyRateOere ??
    sources.orgDefaultRateOere ??
    0
  );
}

/**
 * The same hierarchy expressed in SQL, for the aggregate queries that
 * value many entries at once. Every caller left-joins the two aliases
 * below on their conditions and then uses `entryRateSql` — one definition
 * means the invoice draft, the economy overview, the project value and
 * the week list can never drift apart.
 */
export const projectRoleRate = alias(roleRates, "project_role_rate");
export const companyRoleRate = alias(roleRates, "company_role_rate");

/**
 * Join conditions for the two role-rate lookups. The customer lookup uses
 * the entry's own customer, falling back to the project's, so an entry
 * booked only on a project still finds the customer agreement.
 */
export const projectRoleRateOn: SQL = and(
  eq(projectRoleRate.roleId, timeEntries.roleId),
  eq(projectRoleRate.projectId, timeEntries.projectId),
  isNotNull(projectRoleRate.projectId),
)!;

export const companyRoleRateOn: SQL = and(
  eq(companyRoleRate.roleId, timeEntries.roleId),
  sql`${companyRoleRate.companyId} = coalesce(${timeEntries.companyId}, ${projects.companyId})`,
  isNotNull(companyRoleRate.companyId),
)!;

/**
 * Resolved øre-per-hour for one time-entry row. Requires `tasks`,
 * `projects`, `companies`, `projectRoleRate` and `companyRoleRate` to be
 * joined.
 */
export function entryRateSql(orgDefaultRateOere: number): SQL<number> {
  return sql<number>`coalesce(
    ${projectRoleRate.hourlyRateOere},
    ${companyRoleRate.hourlyRateOere},
    ${tasks.hourlyRateOere},
    ${projects.hourlyRateOere},
    ${companies.hourlyRateOere},
    ${orgDefaultRateOere},
    0
  )`;
}

/** Value of a set of entries in øre, using the hierarchy above. */
export function entryValueSql(orgDefaultRateOere: number): SQL<number> {
  return sql<number>`coalesce(sum(round(${timeEntries.durationMinutes} * ${entryRateSql(orgDefaultRateOere)} / 60.0)), 0)::bigint`;
}
