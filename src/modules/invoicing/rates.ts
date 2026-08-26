/**
 * Hourly-rate resolution for a time entry. All rates are øre EXCLUDING
 * VAT. The most specific choice wins:
 *
 *   role on the entry  ->  task  ->  project  ->  customer  ->  org default
 *
 * The role outranks the task/project rates on purpose: it is picked per
 * entry and exists precisely to differentiate work within one project
 * (decided with Martin, 2026-08-26).
 */
export type RateSources = {
  roleRateOere?: number | null;
  taskRateOere?: number | null;
  projectRateOere?: number | null;
  companyRateOere?: number | null;
  orgDefaultRateOere?: number | null;
};

export function resolveHourlyRateOere(sources: RateSources): number {
  return (
    sources.roleRateOere ??
    sources.taskRateOere ??
    sources.projectRateOere ??
    sources.companyRateOere ??
    sources.orgDefaultRateOere ??
    0
  );
}
