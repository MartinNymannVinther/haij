/**
 * What a full export contains, and what it deliberately leaves out.
 *
 * The list is written by hand rather than derived from the schema, because
 * "everything in the database" is the wrong answer twice over: it would
 * carry secrets out of the system, and it would silently start including
 * whatever table someone adds next. A new table appears in the export when
 * a person decides it should, which is the same discipline the tenancy
 * checklist asks for.
 *
 * Order matters: it is the order of the tabs in the spreadsheet, and it
 * runs from the things a person recognizes (customers, invoices) toward the
 * technical ones (audit trail).
 */

export type ExportTable = {
  /** Database table, from this fixed list and never from user input. */
  table: string;
  /** Tab name in the spreadsheet, and key in the JSON export. */
  sheet: string;
  /** Columns never written out, whatever they contain. */
  redact?: string[];
  /** Column to sort by; falls back to the primary key's insertion order. */
  orderBy?: string;
};

export const EXPORT_TABLES: ExportTable[] = [
  { table: "companies", sheet: "Kunder", orderBy: "name" },
  { table: "contacts", sheet: "Kontakter", orderBy: "name" },
  { table: "activities", sheet: "Aktiviteter", orderBy: "happened_at" },
  { table: "projects", sheet: "Projekter", orderBy: "name" },
  { table: "tasks", sheet: "Opgaver", orderBy: "created_at" },
  { table: "time_entries", sheet: "Tidsregistreringer", orderBy: "entry_date" },
  { table: "roles", sheet: "Roller", orderBy: "name" },
  { table: "role_rates", sheet: "Timepriser", orderBy: "created_at" },
  { table: "invoices", sheet: "Fakturaer", orderBy: "invoice_number" },
  { table: "invoice_lines", sheet: "Fakturalinjer", orderBy: "created_at" },
  { table: "invoice_counters", sheet: "Fakturatæller", orderBy: "next_number" },
  { table: "budgets", sheet: "Budgetter", orderBy: "year" },
  { table: "org_profiles", sheet: "Virksomhedsprofil", orderBy: "org_id" },
  { table: "signal_settings", sheet: "Signalopsætning", orderBy: "org_id" },
  { table: "signals", sheet: "Signaler", orderBy: "created_at" },
  { table: "knowledge_sources", sheet: "Videnskilder", orderBy: "created_at" },
  { table: "knowledge_items", sheet: "Viden", orderBy: "created_at" },
  { table: "knowledge_digests", sheet: "Videnresuméer", orderBy: "created_at" },
  {
    table: "api_keys",
    sheet: "API-nøgler",
    // The hash is the credential and never leaves the system. The prefix
    // stays: it is a label, shown in Haij's own key list so a person can
    // tell one key from another, and the audit trigger already treats it
    // the same way. Redacting it here and not there would be a rule that
    // only looks like a rule — and the audit trail is exported too, so the
    // trigger's redaction is the boundary that actually holds.
    redact: ["key_hash"],
    orderBy: "created_at",
  },
  { table: "audit_log", sheet: "Revisionsspor", orderBy: "created_at" },
];

/**
 * Left out on purpose:
 *
 * - `org_logos`, because it holds image bytes that belong in a file rather
 *   than a spreadsheet cell, and you already have the logo you uploaded.
 * - Everything Better Auth owns (users, sessions, accounts, passkeys, two
 *   factors, rate limits). Sessions and passkeys are credentials, and the
 *   people are exported as members below rather than as auth rows.
 * - `access_requests` and `access_invitations`: they belong to the
 *   installation, not to any organization, and describe people who are
 *   not users of it. The application role cannot read them anyway.
 */
export const MEMBERS_SHEET = "Brugere";
