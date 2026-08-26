import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { authDb } from "@/core/db/client";
import { apiKeys } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * MCP API keys. The plaintext (haij_ + 40 hex chars) exists only in the
 * creation response; storage holds a SHA-256 hash. Resolution runs on
 * the auth role because - like a login - it happens before any org
 * context exists (ADR 0006).
 */

const PREFIX_LENGTH = 12;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function createApiKey(
  ctx: OrgContext,
  name: string,
): Promise<{ id: string; plaintext: string; keyPrefix: string }> {
  const plaintext = `haij_${randomBytes(20).toString("hex")}`;
  const keyPrefix = plaintext.slice(0, PREFIX_LENGTH);
  const [created] = await withOrgContext(ctx, (tx) =>
    tx
      .insert(apiKeys)
      .values({
        orgId: ctx.orgId,
        name,
        keyPrefix,
        keyHash: hashKey(plaintext),
        createdBy: ctx.userId,
      })
      .returning({ id: apiKeys.id }),
  );
  if (!created) throw new Error("api key insert returned no row");
  return { id: created.id, plaintext, keyPrefix };
}

export async function listApiKeys(ctx: OrgContext) {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt)),
  );
}

export async function revokeApiKey(ctx: OrgContext, keyId: string) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(apiKeys.id, keyId))
      .returning({ id: apiKeys.id });
    if (result.length === 0) throw new Error("KEY_NOT_FOUND");
  });
}

export type ResolvedKey = { keyId: string; orgId: string; userId: string };

/** Bearer -> tenant context; constant-time compare on the stored hash. */
export async function resolveApiKey(bearer: string): Promise<ResolvedKey | null> {
  if (!/^haij_[0-9a-f]{40}$/.test(bearer)) return null;
  const hash = hashKey(bearer);
  const [row] = await authDb
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      createdBy: apiKeys.createdBy,
      keyHash: apiKeys.keyHash,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  if (!row || row.revokedAt) return null;
  const stored = Buffer.from(row.keyHash, "hex");
  const candidate = Buffer.from(hash, "hex");
  if (stored.length !== candidate.length || !timingSafeEqual(stored, candidate)) return null;

  // Touch last_used_at, best effort and throttled to once a minute.
  authDb
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {});
  return { keyId: row.id, orgId: row.orgId, userId: row.createdBy };
}
