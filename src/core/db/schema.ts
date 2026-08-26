import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Base schema for phase 0.
 *
 * The auth tables (users, sessions, accounts, verifications, organizations,
 * memberships, invitations, passkeys, two_factors, rate_limits) are owned by
 * Better Auth and queried exclusively through the `haij_auth` role. The
 * application role `haij_app` only ever gets the narrow read access defined
 * in the RLS migration.
 *
 * All timestamps are timestamptz; all tables get RLS enabled + forced in the
 * RLS migration (drizzle/....sql).
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    // Account identity is scoped by issuer since Better Auth 1.7
    // (e.g. "local:credential" for password accounts).
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_issuer_account_uq").on(t.issuer, t.accountId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitations_organization_id_idx").on(t.organizationId)],
);

export const passkeys = pgTable(
  "passkeys",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("passkeys_user_id_idx").on(t.userId)],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user_id_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Phase 1 domain tables (CRM + time tracking). Every table carries    */
/* org_id and gets forced RLS + audit trigger in the 0004 migration.   */
/* ------------------------------------------------------------------ */

const domainId = (name: string) =>
  text(name)
    .primaryKey()
    .default(sql`(gen_random_uuid())::text`);

export const PIPELINE_STAGES = ["lead", "dialogue", "proposal", "won", "lost"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const ACTIVITY_TYPES = [
  "note",
  "call",
  "meeting",
  "email",
  "stage_change",
  "system",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const companies = pgTable(
  "companies",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cvr: text("cvr"),
    address: text("address"),
    zipcode: text("zipcode"),
    city: text("city"),
    country: text("country").notNull().default("DK"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    industryCode: text("industry_code"),
    industryText: text("industry_text"),
    companyType: text("company_type"),
    pipelineStage: text("pipeline_stage").notNull().default("lead"),
    /** Agreed frame with the customer, if any: hours and/or amount. */
    budgetMinutes: integer("budget_minutes"),
    budgetAmountOere: bigint("budget_amount_oere", { mode: "number" }),
    /** Customer-specific hourly rate; falls back to the org default. */
    hourlyRateOere: bigint("hourly_rate_oere", { mode: "number" }),
    cvrData: jsonb("cvr_data"),
    cvrSyncedAt: timestamp("cvr_synced_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("companies_org_idx").on(t.orgId),
    index("companies_org_stage_idx").on(t.orgId, t.pipelineStage),
    uniqueIndex("companies_org_cvr_uq")
      .on(t.orgId, t.cvr)
      .where(sql`cvr is not null`),
    check("companies_cvr_format", sql`cvr is null or cvr ~ '^[0-9]{8}$'`),
    check(
      "companies_stage_valid",
      sql`pipeline_stage in ('lead', 'dialogue', 'proposal', 'won', 'lost')`,
    ),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("contacts_org_company_idx").on(t.orgId, t.companyId)],
);

export const activities = pgTable(
  "activities",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    happenedAt: timestamp("happened_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_org_company_time_idx").on(t.orgId, t.companyId, t.happenedAt),
    index("activities_org_time_idx").on(t.orgId, t.happenedAt),
    check(
      "activities_type_valid",
      sql`type in ('note', 'call', 'meeting', 'email', 'stage_change', 'system')`,
    ),
  ],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    entryDate: date("entry_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    note: text("note"),
    /** Set when the entry is pulled onto an invoice line (draft or issued). */
    invoiceLineId: text("invoice_line_id").references(() => invoiceLines.id, {
      onDelete: "set null",
    }),
    /** Optional link to a project (phase 3); survives project deletion as null. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Optional task within the project; carries its own rate override. */
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    /** Optional role that performed the work; wins the rate resolution. */
    roleId: text("role_id").references(() => roles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("time_entries_org_date_idx").on(t.orgId, t.entryDate),
    index("time_entries_org_user_date_idx").on(t.orgId, t.userId, t.entryDate),
    index("time_entries_org_company_idx").on(t.orgId, t.companyId),
    index("time_entries_org_project_idx").on(t.orgId, t.projectId),
    check("time_entries_duration_valid", sql`duration_minutes between 1 and 1440`),
  ],
);

/**
 * Org-wide role catalog for differentiated hourly rates (e.g. senior
 * advisory vs. project management). Rates are øre EXcl. VAT. A role on a
 * time entry wins the rate resolution: role -> task -> project ->
 * company -> org default.
 */
export const roles = pgTable(
  "roles",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hourlyRateOere: bigint("hourly_rate_oere", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_org_name_uq").on(t.orgId, t.name)],
);

/* ------------------------------------------------------------------ */
/* Phase 3: light project management — projects, tasks, linked time.   */
/* ------------------------------------------------------------------ */

export const PROJECT_STATUSES = ["active", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable(
  "projects",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    /** Agreed frame for this project, if any: hours and/or amount. */
    budgetMinutes: integer("budget_minutes"),
    budgetAmountOere: bigint("budget_amount_oere", { mode: "number" }),
    /** Project-specific hourly rate (øre excl. VAT); beats the customer rate. */
    hourlyRateOere: bigint("hourly_rate_oere", { mode: "number" }),
    deadline: date("deadline"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("projects_org_status_idx").on(t.orgId, t.status),
    index("projects_org_company_idx").on(t.orgId, t.companyId),
    check("projects_status_valid", sql`status in ('active', 'done', 'archived')`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isDone: boolean("is_done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    dueDate: date("due_date"),
    position: integer("position").notNull().default(0),
    /** Task-specific hourly rate (øre excl. VAT); beats the project rate. */
    hourlyRateOere: bigint("hourly_rate_oere", { mode: "number" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("tasks_org_project_idx").on(t.orgId, t.projectId)],
);

/* ------------------------------------------------------------------ */
/* Phase 2: invoicing, org profile and budgets. Amounts are integer    */
/* øre for exact VAT arithmetic; fields map cleanly to Peppol BIS 3.0. */
/* ------------------------------------------------------------------ */

export const INVOICE_STATUSES = ["draft", "issued", "sent", "paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_TYPES = ["invoice", "credit_note"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const VAT_CATEGORIES = ["standard", "zero", "exempt"] as const;
export type VatCategory = (typeof VAT_CATEGORIES)[number];

/** Danish standard VAT, 25%, in basis points. Verify before changing. */
export const VAT_RATE_STANDARD_BP = 2500;

export const INVOICE_UNITS = ["hour", "day", "piece", "fixed"] as const;
export type InvoiceUnit = (typeof INVOICE_UNITS)[number];

/** Seller master data required on every invoice (fakturakrav). */
export const orgProfiles = pgTable("org_profiles", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  cvr: text("cvr").notNull(),
  address: text("address").notNull(),
  zipcode: text("zipcode").notNull(),
  city: text("city").notNull(),
  email: text("email"),
  phone: text("phone"),
  bankReg: text("bank_reg"),
  bankKonto: text("bank_konto"),
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(14),
  defaultHourlyRateOere: bigint("default_hourly_rate_oere", { mode: "number" }),
  ...timestamps,
});

/**
 * Company logo, stored in Postgres so backup and exit stay one database.
 * Kept out of org_profiles on purpose: the audit trigger snapshots whole
 * rows, and a base64 image would bloat every profile audit entry. This
 * table has no row trigger; the service writes a semantic audit event
 * instead (same pattern as auth events, see ADR 0003 exclusions).
 */
export const orgLogos = pgTable(
  "org_logos",
  {
    orgId: text("org_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Raw base64 (no data: prefix); rendered as a data URL when needed. */
    data: text("data").notNull(),
    contentType: text("content_type").notNull(),
    ...timestamps,
  },
  () => [check("org_logos_type_valid", sql`content_type in ('image/png', 'image/jpeg')`)],
);

/** Gapless sequential invoice numbers, one series per organization. */
export const invoiceCounters = pgTable("invoice_counters", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  nextNumber: integer("next_number").notNull().default(1),
});

export const invoices = pgTable(
  "invoices",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("invoice"),
    creditedInvoiceId: text("credited_invoice_id"),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    invoiceNumber: integer("invoice_number"),
    invoiceDate: date("invoice_date"),
    deliveryDate: date("delivery_date"),
    dueDate: date("due_date"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(14),
    currency: text("currency").notNull().default("DKK"),
    // Buyer snapshot (frozen at issue; editable while draft)
    buyerName: text("buyer_name"),
    buyerCvr: text("buyer_cvr"),
    buyerAddress: text("buyer_address"),
    buyerZipcode: text("buyer_zipcode"),
    buyerCity: text("buyer_city"),
    buyerEanGln: text("buyer_ean_gln"),
    buyerReference: text("buyer_reference"),
    // Seller snapshot (copied from org_profiles at issue)
    sellerName: text("seller_name"),
    sellerCvr: text("seller_cvr"),
    sellerAddress: text("seller_address"),
    sellerZipcode: text("seller_zipcode"),
    sellerCity: text("seller_city"),
    sellerEmail: text("seller_email"),
    sellerPhone: text("seller_phone"),
    sellerBankReg: text("seller_bank_reg"),
    sellerBankKonto: text("seller_bank_konto"),
    note: text("note"),
    netOere: bigint("net_oere", { mode: "number" }).notNull().default(0),
    vatOere: bigint("vat_oere", { mode: "number" }).notNull().default(0),
    grossOere: bigint("gross_oere", { mode: "number" }).notNull().default(0),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("invoices_org_status_idx").on(t.orgId, t.status),
    index("invoices_org_company_idx").on(t.orgId, t.companyId),
    uniqueIndex("invoices_org_number_uq")
      .on(t.orgId, t.invoiceNumber)
      .where(sql`invoice_number is not null`),
    check("invoices_status_valid", sql`status in ('draft', 'issued', 'sent', 'paid')`),
    check("invoices_type_valid", sql`type in ('invoice', 'credit_note')`),
    check(
      "invoices_issued_have_number",
      sql`status = 'draft' or (invoice_number is not null and invoice_date is not null)`,
    ),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    /** Quantity in hundredths (2 decimals), e.g. 1.50 stored as 150. */
    quantityHundredths: integer("quantity_hundredths").notNull(),
    unit: text("unit").notNull().default("hour"),
    unitPriceOere: bigint("unit_price_oere", { mode: "number" }).notNull(),
    vatCategory: text("vat_category").notNull().default("standard"),
    /** Basis points: 2500 = 25 %. */
    vatRateBp: integer("vat_rate_bp").notNull().default(2500),
    lineNetOere: bigint("line_net_oere", { mode: "number" }).notNull(),
    lineVatOere: bigint("line_vat_oere", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("invoice_lines_org_invoice_idx").on(t.orgId, t.invoiceId),
    check("invoice_lines_unit_valid", sql`unit in ('hour', 'day', 'piece', 'fixed')`),
    check(
      "invoice_lines_vat_valid",
      sql`vat_category in ('standard', 'zero', 'exempt') and vat_rate_bp between 0 and 10000`,
    ),
    check("invoice_lines_quantity_valid", sql`quantity_hundredths <> 0`),
  ],
);

/** Monthly revenue targets; actuals are computed from issued invoices. */
export const budgets = pgTable(
  "budgets",
  {
    id: domainId("id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    revenueTargetOere: bigint("revenue_target_oere", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("budgets_org_year_month_uq").on(t.orgId, t.year, t.month),
    check("budgets_month_valid", sql`month between 1 and 12`),
  ],
);

/**
 * Append-only audit log; one row per mutation (who, what, when, org,
 * before/after). Written by database triggers plus semantic auth events.
 *
 * Deliberately no foreign keys: the audit trail is immutable and must never
 * be updated or deleted as a side effect of ON DELETE actions on other rows.
 * Enforcement lives in the RLS/audit migration (no UPDATE/DELETE privileges
 * plus a trigger that rejects both).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    orgId: text("org_id"),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull().default("system"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before_data"),
    after: jsonb("after_data"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);
