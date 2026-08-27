import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { LlmProvider } from "@/core/llm";
import {
  addSource,
  deleteSource,
  fetchKnowledge,
  generateDigest,
  listDigests,
  listItems,
  listSources,
  setSourceActive,
} from "@/modules/knowledge/service";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";
import type { Client } from "pg";

const ORG_A = "org_know_a";
const ORG_B = "org_know_b";
const USER_A = "user_know_a";
const CTX_A = { orgId: ORG_A, userId: USER_A };
const CTX_B = { orgId: ORG_B, userId: "user_know_b" };

const FEED = `<rss><channel>
  <item><title>Ny vejledning om udbudsloven</title><link>https://example.dk/a1</link><guid>a1</guid>
    <description>Konkurrencestyrelsen har opdateret vejledningen.</description></item>
  <item><title>AI i den offentlige sektor</title><link>https://example.dk/a2</link><guid>a2</guid></item>
</channel></rss>`;

const fakeFetch: typeof fetch = async () => new Response(FEED, { status: 200 });

const fakeProvider: LlmProvider = {
  id: "fake",
  label: "Fake",
  model: "fake-model",
  async complete() {
    return {
      content: "Ugens vigtigste tema er udbudsret og AI. Hold øje med den nye vejledning.",
      model: "fake-model",
      usage: null,
    };
  },
  async healthCheck() {
    return { ok: true, detail: "fake" };
  },
};

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Know A', 'know-a', now()), ($2, 'Know B', 'know-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Know A', 'know-a@example.com'), ('user_know_b', 'Know B', 'know-b@example.com')`,
    [USER_A],
  );
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

describe("knowledge flow", () => {
  it("adds sources, fetches items with dedupe and lists them", async () => {
    await addSource(CTX_A, "Testkilde", "https://example.dk/feed");
    const sources = await listSources(CTX_A);
    expect(sources).toHaveLength(1);

    const first = await fetchKnowledge(CTX_A, fakeFetch);
    expect(first).toEqual({ inserted: 2, failedSources: [] });
    const again = await fetchKnowledge(CTX_A, fakeFetch);
    expect(again.inserted).toBe(0);

    const items = await listItems(CTX_A);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sourceName)).toEqual(["Testkilde", "Testkilde"]);
  });

  it("inactive sources are skipped", async () => {
    const [source] = await listSources(CTX_A);
    await setSourceActive(CTX_A, source!.id, false);
    const result = await fetchKnowledge(CTX_A, fakeFetch);
    expect(result.inserted).toBe(0);
    await setSourceActive(CTX_A, source!.id, true);
  });

  it("generates a digest with the injected provider and refuses without one", async () => {
    expect(await generateDigest(CTX_A, null)).toEqual({ error: "NO_PROVIDER" });

    const result = await generateDigest(CTX_A, fakeProvider);
    expect("id" in result).toBe(true);
    const digests = await listDigests(CTX_A);
    expect(digests).toHaveLength(1);
    expect(digests[0]!.content).toContain("udbudsret");
    expect(digests[0]!.itemCount).toBe(2);
    expect(digests[0]!.model).toBe("fake-model");

    expect(await generateDigest(CTX_B, fakeProvider)).toEqual({ error: "NO_ITEMS" });
  });

  it("deleting a source cascades its items but keeps digests", async () => {
    const [source] = await listSources(CTX_A);
    expect(await deleteSource(CTX_A, source!.id)).toBe(true);
    expect(await listItems(CTX_A)).toHaveLength(0);
    expect(await listDigests(CTX_A)).toHaveLength(1);
  });

  it("cross-tenant isolation holds for all three tables", async () => {
    await addSource(CTX_A, "Kun A", "https://example.dk/only-a");
    for (const table of ["knowledge_sources", "knowledge_items", "knowledge_digests"] as const) {
      const rows = await asApp(app, { orgId: ORG_B, userId: "user_know_b" }, (c) =>
        c.query(`select count(*)::int as n from ${table}`),
      );
      expect(rows.rows[0].n, table).toBe(0);
      const denied = await asApp(app, null, (c) =>
        c.query(`select count(*)::int as n from ${table}`),
      );
      expect(denied.rows[0].n, `${table} no ctx`).toBe(0);
    }
    const code = await asApp(app, { orgId: ORG_B, userId: "user_know_b" }, (c) =>
      expectSqlError(
        c.query(
          `insert into knowledge_sources (org_id, name, url) values ($1, 'Smuglet', 'https://x.dk')`,
          [ORG_A],
        ),
      ),
    );
    expect(code).toBe("42501");
  });
});
