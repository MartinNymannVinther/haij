import { headers } from "next/headers";
import { cache } from "react";
import type { OrgContext } from "@/core/db/tenant";
import { auth } from "./auth";

/** Current session, or null. Cached per request. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Tenant context for the current request, used with withOrgContext().
 * Returns null when there is no session or no active organization.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const session = await getSession();
  if (!session) return null;
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;
  return { orgId, userId: session.user.id };
}
