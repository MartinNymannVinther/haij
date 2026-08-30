import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  activities,
  companies,
  contacts,
  timeEntries,
  users,
  type ActivityType,
  type ContactCategory,
  type PipelineStage,
} from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * CRM services. Every function runs inside withOrgContext, so RLS scopes
 * all reads and writes to the caller's active organization.
 */

export type CompanyInput = {
  name: string;
  cvr?: string | null;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string;
  phone?: string | null;
  email?: string | null;
  /** Where invoices go; falls back to `email` when empty. */
  invoiceEmail?: string | null;
  /** EAN/GLN for public-sector customers, 13 digits. */
  eanGln?: string | null;
  website?: string | null;
  industryCode?: string | null;
  industryText?: string | null;
  companyType?: string | null;
  cvrData?: unknown;
};

export async function listCompanies(ctx: OrgContext, query?: string, stage?: PipelineStage) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: companies.id,
        name: companies.name,
        cvr: companies.cvr,
        city: companies.city,
        pipelineStage: companies.pipelineStage,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(
        and(
          query
            ? or(ilike(companies.name, `%${query}%`), ilike(companies.cvr, `%${query}%`))
            : undefined,
          stage ? eq(companies.pipelineStage, stage) : undefined,
        ),
      )
      .orderBy(companies.name),
  );
}

export async function listCompaniesForPipeline(ctx: OrgContext) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: companies.id,
        name: companies.name,
        city: companies.city,
        pipelineStage: companies.pipelineStage,
        updatedAt: companies.updatedAt,
      })
      .from(companies)
      .orderBy(desc(companies.updatedAt)),
  );
}

export async function getCompanyDetail(ctx: OrgContext, companyId: string) {
  return withOrgContext(ctx, async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return null;

    // The column is a plain text[] in the database; the check constraint
    // keeps it inside CONTACT_CATEGORIES, so narrowing here is safe and
    // saves every view from doing it.
    const companyContacts = (
      await tx
        .select()
        .from(contacts)
        .where(eq(contacts.companyId, companyId))
        .orderBy(desc(contacts.isPrimary), contacts.name)
    ).map((contact) => ({ ...contact, categories: contact.categories as ContactCategory[] }));

    const timeline = await tx
      .select({
        id: activities.id,
        type: activities.type,
        body: activities.body,
        metadata: activities.metadata,
        happenedAt: activities.happenedAt,
        createdByName: users.name,
      })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.createdBy))
      .where(eq(activities.companyId, companyId))
      .orderBy(desc(activities.happenedAt), desc(activities.id))
      .limit(100);

    const [tracked] = await tx
      .select({ totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int` })
      .from(timeEntries)
      .where(eq(timeEntries.companyId, companyId));

    return {
      company,
      contacts: companyContacts,
      timeline,
      trackedMinutes: tracked?.totalMinutes ?? 0,
    };
  });
}

export async function createCompany(
  ctx: OrgContext,
  input: CompanyInput,
  source: "cvr" | "manual",
) {
  return withOrgContext(ctx, async (tx) => {
    const [created] = await tx
      .insert(companies)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        cvr: input.cvr ?? null,
        address: input.address ?? null,
        zipcode: input.zipcode ?? null,
        city: input.city ?? null,
        country: input.country ?? "DK",
        phone: input.phone ?? null,
        email: input.email ?? null,
        invoiceEmail: input.invoiceEmail ?? null,
        eanGln: input.eanGln ?? null,
        website: input.website ?? null,
        industryCode: input.industryCode ?? null,
        industryText: input.industryText ?? null,
        companyType: input.companyType ?? null,
        cvrData: input.cvrData ?? null,
        cvrSyncedAt: input.cvrData ? new Date() : null,
        createdBy: ctx.userId,
      })
      .returning({ id: companies.id });
    if (!created) throw new Error("company insert returned no row");

    await tx.insert(activities).values({
      orgId: ctx.orgId,
      companyId: created.id,
      type: "system",
      body: null,
      metadata: { event: "company_created", source },
      createdBy: ctx.userId,
    });

    return created.id;
  });
}

export async function updateCompany(ctx: OrgContext, companyId: string, input: CompanyInput) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(companies)
      .set({
        name: input.name,
        cvr: input.cvr ?? null,
        address: input.address ?? null,
        zipcode: input.zipcode ?? null,
        city: input.city ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        invoiceEmail: input.invoiceEmail ?? null,
        eanGln: input.eanGln ?? null,
        website: input.website ?? null,
      })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    return result.length > 0;
  });
}

export async function setPipelineStage(ctx: OrgContext, companyId: string, stage: PipelineStage) {
  return withOrgContext(ctx, async (tx) => {
    const [current] = await tx
      .select({ stage: companies.pipelineStage })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!current || current.stage === stage) return current?.stage ?? null;

    await tx.update(companies).set({ pipelineStage: stage }).where(eq(companies.id, companyId));
    await tx.insert(activities).values({
      orgId: ctx.orgId,
      companyId,
      type: "stage_change",
      metadata: { from: current.stage, to: stage },
      createdBy: ctx.userId,
    });
    return stage;
  });
}

export async function deleteCompany(ctx: OrgContext, companyId: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .delete(companies)
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    return result.length > 0;
  });
}

export type ContactInput = {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  /** What this person is to the business; see CONTACT_CATEGORIES. */
  categories?: ContactCategory[];
};

/**
 * Guards against cross-tenant references: a foreign key alone does not know
 * about organizations, so before attaching anything to a company we check
 * that the company is visible under the caller's RLS context.
 */
async function assertCompanyInOrg(
  tx: Parameters<Parameters<typeof withOrgContext>[1]>[0],
  companyId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) throw new Error("COMPANY_NOT_FOUND");
}

export async function addContact(ctx: OrgContext, companyId: string, input: ContactInput) {
  return withOrgContext(ctx, async (tx) => {
    await assertCompanyInOrg(tx, companyId);
    if (input.isPrimary) {
      await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.companyId, companyId));
    }
    const [created] = await tx
      .insert(contacts)
      .values({
        orgId: ctx.orgId,
        companyId,
        name: input.name,
        title: input.title ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        isPrimary: input.isPrimary ?? false,
        categories: input.categories ?? [],
        createdBy: ctx.userId,
      })
      .returning({ id: contacts.id });
    return created?.id ?? null;
  });
}

export async function updateContact(ctx: OrgContext, contactId: string, input: ContactInput) {
  return withOrgContext(ctx, async (tx) => {
    const [existing] = await tx
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!existing) return false;
    if (input.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(eq(contacts.companyId, existing.companyId));
    }
    const result = await tx
      .update(contacts)
      .set({
        name: input.name,
        title: input.title ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        isPrimary: input.isPrimary ?? false,
        categories: input.categories ?? [],
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId))
      .returning({ id: contacts.id });
    return result.length > 0;
  });
}

export type ContactRow = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  categories: ContactCategory[];
  companyId: string;
  companyName: string;
};

/**
 * Every contact across every customer. The categories only earn their
 * keep once you can look at them together, so this is the list behind
 * the Kontakter page: a free-text match on name, title, email or company,
 * and a filter on one category.
 */
export async function listAllContacts(
  ctx: OrgContext,
  query?: string,
  category?: ContactCategory,
): Promise<ContactRow[]> {
  return withOrgContext(ctx, async (tx) => {
    const filters = [];
    const trimmed = query?.trim();
    if (trimmed) {
      const like = `%${trimmed}%`;
      filters.push(
        sql`(${contacts.name} ilike ${like} or ${contacts.title} ilike ${like} or ${contacts.email} ilike ${like} or ${companies.name} ilike ${like})`,
      );
    }
    if (category) filters.push(sql`${contacts.categories} @> ARRAY[${category}]::text[]`);

    const rows = await tx
      .select({
        id: contacts.id,
        name: contacts.name,
        title: contacts.title,
        email: contacts.email,
        phone: contacts.phone,
        isPrimary: contacts.isPrimary,
        categories: contacts.categories,
        companyId: contacts.companyId,
        companyName: companies.name,
      })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(contacts.name));

    return rows.map((row) => ({ ...row, categories: row.categories as ContactCategory[] }));
  });
}

/** How many contacts carry each category, for the filter row. */
export async function countContactsByCategory(
  ctx: OrgContext,
): Promise<Record<string, number> & { all: number }> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        category: sql<string>`unnest(${contacts.categories})`.as("category"),
        count: sql<number>`count(*)::int`,
      })
      .from(contacts)
      .groupBy(sql`1`);
    const [total] = await tx.select({ count: sql<number>`count(*)::int` }).from(contacts);
    const counts: Record<string, number> & { all: number } = { all: Number(total?.count ?? 0) };
    for (const row of rows) counts[row.category] = Number(row.count);
    return counts;
  });
}

export async function deleteContact(ctx: OrgContext, contactId: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .delete(contacts)
      .where(eq(contacts.id, contactId))
      .returning({ id: contacts.id });
    return result.length > 0;
  });
}

export async function addActivity(
  ctx: OrgContext,
  companyId: string,
  type: Extract<ActivityType, "note" | "call" | "meeting" | "email">,
  body: string,
) {
  return withOrgContext(ctx, async (tx) => {
    await assertCompanyInOrg(tx, companyId);
    const [created] = await tx
      .insert(activities)
      .values({
        orgId: ctx.orgId,
        companyId,
        type,
        body,
        createdBy: ctx.userId,
      })
      .returning({ id: activities.id });
    return created?.id ?? null;
  });
}

/** Dashboard numbers: company count, stage distribution, latest activity. */
export async function getCrmOverview(ctx: OrgContext) {
  return withOrgContext(ctx, async (tx) => {
    const stages = await tx
      .select({ stage: companies.pipelineStage, count: count() })
      .from(companies)
      .groupBy(companies.pipelineStage);

    const latest = await tx
      .select({
        id: activities.id,
        type: activities.type,
        body: activities.body,
        metadata: activities.metadata,
        happenedAt: activities.happenedAt,
        companyId: activities.companyId,
        companyName: companies.name,
      })
      .from(activities)
      .innerJoin(companies, eq(companies.id, activities.companyId))
      .orderBy(desc(activities.happenedAt), desc(activities.id))
      .limit(8);

    return { stages, latest };
  });
}
