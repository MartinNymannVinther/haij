/**
 * The report's option vocabulary, kept apart from the query that uses it.
 *
 * The filter form is a client component, and importing these from the
 * service would drag the database client into the browser bundle. Two
 * small arrays in their own file is the cheapest way to keep that
 * boundary honest.
 */

export const REPORT_GROUPINGS = ["none", "company", "project", "task", "role", "month"] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

export const REPORT_STATUSES = ["all", "unbilled", "billed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
