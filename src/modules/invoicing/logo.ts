import { eq } from "drizzle-orm";
import { auditLog, orgLogos } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * Company logo, stored as base64 in Postgres (one database to back up,
 * one to take along when leaving). The blob table has no audit row
 * trigger — a semantic audit event is written here instead, so the log
 * records the change without carrying the image.
 */

export const LOGO_MAX_BYTES = 1024 * 1024; // 1 MB decoded
export const LOGO_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

export type OrgLogo = { dataUrl: string; contentType: LogoContentType };

export async function getOrgLogo(ctx: OrgContext): Promise<OrgLogo | null> {
  return withOrgContext(ctx, async (tx) => {
    const [logo] = await tx
      .select({ data: orgLogos.data, contentType: orgLogos.contentType })
      .from(orgLogos)
      .where(eq(orgLogos.orgId, ctx.orgId))
      .limit(1);
    if (!logo) return null;
    return {
      dataUrl: `data:${logo.contentType};base64,${logo.data}`,
      contentType: logo.contentType as LogoContentType,
    };
  });
}

export async function saveOrgLogo(
  ctx: OrgContext,
  base64: string,
  contentType: LogoContentType,
): Promise<void> {
  return withOrgContext(ctx, async (tx) => {
    await tx
      .insert(orgLogos)
      .values({ orgId: ctx.orgId, data: base64, contentType })
      .onConflictDoUpdate({
        target: orgLogos.orgId,
        set: { data: base64, contentType, updatedAt: new Date() },
      });
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      actorType: "user",
      action: "org_logos.updated",
      entityType: "org_logo",
      entityId: ctx.orgId,
    });
  });
}

export async function deleteOrgLogo(ctx: OrgContext): Promise<boolean> {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .delete(orgLogos)
      .where(eq(orgLogos.orgId, ctx.orgId))
      .returning({ orgId: orgLogos.orgId });
    if (result.length === 0) return false;
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      actorType: "user",
      action: "org_logos.deleted",
      entityType: "org_logo",
      entityId: ctx.orgId,
    });
    return true;
  });
}
