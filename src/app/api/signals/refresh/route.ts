import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { authDb } from "@/core/db/client";
import { organizations } from "@/core/db/schema";
import { env } from "@/core/env";
import { refreshSignals } from "@/modules/signals/service";

export const runtime = "nodejs";

/**
 * Unattended signal refresh for cron (ADR 0005: a cron endpoint until
 * Haij is deployed and pg-boss takes over). Answers 404 until
 * SIGNALS_CRON_SECRET is configured; requires the secret as a bearer
 * token. Runs per organization under its own RLS context — the actor
 * is recorded as "system".
 *
 * Example crontab: curl -X POST -H "Authorization: Bearer $SECRET" \
 *   https://haij.example/api/signals/refresh
 */
export async function POST(request: NextRequest) {
  const secret = env.SIGNALS_CRON_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // The auth role may read organizations (Better Auth owns that table);
  // each org's refresh then runs fully RLS-scoped as the app role.
  const orgs = await authDb
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(sql`${organizations.createdAt} asc`)
    .limit(50);

  const results: Array<{ orgId: string; inserted: number; scored: number }> = [];
  for (const org of orgs) {
    try {
      const result = await refreshSignals({ orgId: org.id, userId: "system" });
      results.push({ orgId: org.id, inserted: result.inserted, scored: result.scored });
    } catch (error) {
      console.error(`signals: cron refresh failed for ${org.id}`, error);
      results.push({ orgId: org.id, inserted: 0, scored: 0 });
    }
  }
  return Response.json({ ok: true, organizations: results.length, results });
}

export function GET() {
  return new Response("Method not allowed", { status: 405 });
}
