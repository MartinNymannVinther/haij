import { eq } from "drizzle-orm";
import { orgProfiles } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * The organization's seller master data — everything the fakturakrav
 * require on the seller side. Invoices cannot be issued until this exists.
 */

export type OrgProfileInput = {
  legalName: string;
  cvr: string;
  address: string;
  zipcode: string;
  city: string;
  email?: string | null;
  phone?: string | null;
  bankReg?: string | null;
  bankKonto?: string | null;
  defaultPaymentTermsDays?: number;
  defaultHourlyRateOere?: number | null;
};

export async function getOrgProfile(ctx: OrgContext) {
  return withOrgContext(ctx, async (tx) => {
    const [profile] = await tx
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, ctx.orgId))
      .limit(1);
    return profile ?? null;
  });
}

export async function upsertOrgProfile(ctx: OrgContext, input: OrgProfileInput) {
  return withOrgContext(ctx, async (tx) => {
    const values = {
      legalName: input.legalName,
      cvr: input.cvr,
      address: input.address,
      zipcode: input.zipcode,
      city: input.city,
      email: input.email ?? null,
      phone: input.phone ?? null,
      bankReg: input.bankReg ?? null,
      bankKonto: input.bankKonto ?? null,
      defaultPaymentTermsDays: input.defaultPaymentTermsDays ?? 14,
      defaultHourlyRateOere: input.defaultHourlyRateOere ?? null,
      updatedAt: new Date(),
    };
    await tx
      .insert(orgProfiles)
      .values({ orgId: ctx.orgId, ...values })
      .onConflictDoUpdate({ target: orgProfiles.orgId, set: values });
  });
}
