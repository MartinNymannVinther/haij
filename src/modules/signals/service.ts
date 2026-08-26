import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { env } from "@/core/env";
import { sanitizeText } from "@/core/ingest/sanitize";
import { getLlmProvider } from "@/core/llm";
import {
  activities,
  companies,
  signalSettings,
  signals,
  type SignalStatus,
} from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { CvrEventsAdapter } from "./adapters/cvr-events";
import { RssAdapter, type FeedConfig } from "./adapters/rss";
import { TedAdapter } from "./adapters/ted";
import type { RawSignal, SourceAdapter } from "./adapters/types";
import { scoreSignal } from "./scoring";

/**
 * Signals engine services. Fetching pulls from the configured sources,
 * dedupes on (org, source, source_ref) and scores what is new against
 * the service profile — best effort, bounded per refresh so a big fetch
 * can never run away with tokens.
 */

const SCORE_BATCH_LIMIT = 15;

export type SignalSettingsInput = {
  serviceProfile?: string | null;
  rssFeeds?: FeedConfig[];
  tedKeywords?: string | null;
  cvrBranchePrefixes?: string | null;
};

export async function getSignalSettings(ctx: OrgContext) {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(signalSettings)
      .where(eq(signalSettings.orgId, ctx.orgId))
      .limit(1);
    return row ?? null;
  });
}

export async function saveSignalSettings(ctx: OrgContext, input: SignalSettingsInput) {
  return withOrgContext(ctx, async (tx) => {
    const values = {
      serviceProfile: input.serviceProfile ?? null,
      rssFeeds: input.rssFeeds ?? [],
      tedKeywords: input.tedKeywords ?? null,
      cvrBranchePrefixes: input.cvrBranchePrefixes ?? null,
      updatedAt: new Date(),
    };
    await tx
      .insert(signalSettings)
      .values({ orgId: ctx.orgId, ...values })
      .onConflictDoUpdate({ target: signalSettings.orgId, set: values });
  });
}

function splitList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export type RefreshDeps = {
  fetchFn?: typeof fetch;
  virkUser?: string;
  virkPassword?: string;
};

function buildAdapters(
  settings: typeof signalSettings.$inferSelect,
  deps: Required<Pick<RefreshDeps, "fetchFn">> & RefreshDeps,
): SourceAdapter[] {
  const feeds = Array.isArray(settings.rssFeeds) ? (settings.rssFeeds as FeedConfig[]) : [];
  return [
    new CvrEventsAdapter(
      splitList(settings.cvrBranchePrefixes),
      deps.virkUser,
      deps.virkPassword,
      deps.fetchFn,
    ),
    new TedAdapter(splitList(settings.tedKeywords), deps.fetchFn),
    new RssAdapter(
      feeds.filter((feed) => typeof feed?.url === "string" && /^https?:\/\//.test(feed.url)),
      deps.fetchFn,
    ),
  ];
}

async function insertFetched(
  tx: AppTransaction,
  orgId: string,
  items: RawSignal[],
): Promise<number> {
  let inserted = 0;
  for (const item of items) {
    const title = sanitizeText(item.title, 300);
    if (!title) continue;
    const result = await tx
      .insert(signals)
      .values({
        orgId,
        source: item.source,
        sourceRef: item.sourceRef.slice(0, 500),
        title,
        summary: sanitizeText(item.summary, 2000),
        url: item.url?.slice(0, 1000) ?? null,
        publishedAt:
          item.publishedAt && !Number.isNaN(item.publishedAt.getTime())
            ? item.publishedAt
            : null,
        companyCvr: item.companyCvr,
        payload: item.payload ?? null,
      })
      .onConflictDoNothing({ target: [signals.orgId, signals.source, signals.sourceRef] })
      .returning({ id: signals.id });
    inserted += result.length;
  }
  return inserted;
}

/** Scores up to SCORE_BATCH_LIMIT unscored signals; best effort. */
async function scorePending(ctx: OrgContext, serviceProfile: string | null): Promise<number> {
  const provider = getLlmProvider();
  if (!provider || !serviceProfile?.trim()) return 0;

  const pending = await withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: signals.id,
        source: signals.source,
        title: signals.title,
        summary: signals.summary,
      })
      .from(signals)
      .where(and(isNull(signals.score), eq(signals.status, "new")))
      .orderBy(desc(signals.fetchedAt))
      .limit(SCORE_BATCH_LIMIT),
  );

  let scored = 0;
  for (const signal of pending) {
    const result = await scoreSignal(provider, serviceProfile, signal);
    if (!result) continue;
    await withOrgContext(ctx, (tx) =>
      tx
        .update(signals)
        .set({
          score: result.score,
          scoreReason: result.reason,
          suggestion: result.suggestion,
          scoredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signals.id, signal.id)),
    );
    scored += 1;
  }
  return scored;
}

export type RefreshResult = {
  inserted: number;
  scored: number;
  sources: Array<{ source: string; status: string; detail?: string; fetched?: number }>;
};

export async function refreshSignals(
  ctx: OrgContext,
  deps: RefreshDeps = {},
): Promise<RefreshResult> {
  const settings = await getSignalSettings(ctx);
  if (!settings) {
    return { inserted: 0, scored: 0, sources: [{ source: "all", status: "unconfigured" }] };
  }

  const resolved = {
    fetchFn: deps.fetchFn ?? fetch,
    virkUser: deps.virkUser ?? env.VIRK_CVR_USER,
    virkPassword: deps.virkPassword ?? env.VIRK_CVR_PASSWORD,
  };
  const sources: RefreshResult["sources"] = [];
  let inserted = 0;
  for (const adapter of buildAdapters(settings, resolved)) {
    const result = await adapter.fetchNew();
    if (result.status === "ok") {
      const count = await withOrgContext(ctx, (tx) =>
        insertFetched(tx, ctx.orgId, result.items),
      );
      inserted += count;
      sources.push({ source: adapter.source, status: "ok", fetched: result.items.length });
    } else {
      sources.push({ source: adapter.source, status: result.status, detail: result.detail });
    }
  }

  const scored = await scorePending(ctx, settings.serviceProfile);
  await withOrgContext(ctx, (tx) =>
    tx
      .update(signalSettings)
      .set({ lastFetchedAt: new Date(), updatedAt: new Date() })
      .where(eq(signalSettings.orgId, ctx.orgId)),
  );
  return { inserted, scored, sources };
}

/* ------------------------------ Queries ----------------------------- */

export async function listSignals(ctx: OrgContext, status: SignalStatus) {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: signals.id,
        source: signals.source,
        title: signals.title,
        summary: signals.summary,
        url: signals.url,
        publishedAt: signals.publishedAt,
        companyCvr: signals.companyCvr,
        companyId: signals.companyId,
        companyName: companies.name,
        status: signals.status,
        score: signals.score,
        scoreReason: signals.scoreReason,
        suggestion: signals.suggestion,
        followUpAt: signals.followUpAt,
        fetchedAt: signals.fetchedAt,
      })
      .from(signals)
      .leftJoin(companies, eq(companies.id, signals.companyId))
      .where(eq(signals.status, status))
      .orderBy(sql`${signals.score} desc nulls last`, desc(signals.fetchedAt))
      .limit(200);

    const counts = await tx
      .select({ status: signals.status, count: sql<number>`count(*)::int` })
      .from(signals)
      .groupBy(signals.status);

    return { rows, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.count)])) };
  });
}

/* ------------------------------ Actions ----------------------------- */

export async function setSignalStatus(ctx: OrgContext, signalId: string, status: SignalStatus) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(signals)
      .set({ status, updatedAt: new Date() })
      .where(eq(signals.id, signalId))
      .returning({ id: signals.id });
    if (result.length === 0) throw new Error("SIGNAL_NOT_FOUND");
  });
}

export async function setSignalFollowUp(
  ctx: OrgContext,
  signalId: string,
  followUpAt: string | null,
) {
  return withOrgContext(ctx, async (tx) => {
    const result = await tx
      .update(signals)
      .set({ followUpAt, status: followUpAt ? "saved" : undefined, updatedAt: new Date() })
      .where(eq(signals.id, signalId))
      .returning({ id: signals.id });
    if (result.length === 0) throw new Error("SIGNAL_NOT_FOUND");
  });
}

export async function addManualSignal(
  ctx: OrgContext,
  input: { title: string; url?: string | null; note?: string | null; companyCvr?: string | null },
) {
  return withOrgContext(ctx, async (tx) => {
    const [created] = await tx
      .insert(signals)
      .values({
        orgId: ctx.orgId,
        source: "manual",
        sourceRef: randomUUID(),
        title: sanitizeText(input.title, 300)!,
        summary: sanitizeText(input.note, 2000),
        url: input.url?.slice(0, 1000) || null,
        companyCvr: input.companyCvr || null,
        createdBy: ctx.userId,
      })
      .returning({ id: signals.id });
    return created?.id ?? null;
  });
}

/**
 * Converts a signal into (or links it to) a CRM company. Existing CVR
 * match links; otherwise a company is created from the signal's own
 * data. The signal ends up saved with the company attached.
 */
export async function convertSignalToCompany(ctx: OrgContext, signalId: string) {
  return withOrgContext(ctx, async (tx) => {
    const [signal] = await tx.select().from(signals).where(eq(signals.id, signalId)).limit(1);
    if (!signal) throw new Error("SIGNAL_NOT_FOUND");
    if (signal.companyId) return signal.companyId;

    let companyId: string | null = null;
    if (signal.companyCvr) {
      const [existing] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.cvr, signal.companyCvr))
        .limit(1);
      companyId = existing?.id ?? null;
    }
    if (!companyId) {
      const [created] = await tx
        .insert(companies)
        .values({
          orgId: ctx.orgId,
          name: signal.title.slice(0, 200),
          cvr: signal.companyCvr,
          createdBy: ctx.userId,
        })
        .returning({ id: companies.id });
      if (!created) throw new Error("company insert returned no row");
      companyId = created.id;
    }

    await tx
      .update(signals)
      .set({ companyId, status: "saved", updatedAt: new Date() })
      .where(eq(signals.id, signalId));
    await tx.insert(activities).values({
      orgId: ctx.orgId,
      companyId,
      type: "system",
      metadata: { event: "signal_converted", signalId, source: signal.source },
      createdBy: ctx.userId,
    });
    return companyId;
  });
}
