import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { getTopSignal } from "@/modules/signals/service";
import { adminPool } from "../helpers/db";

/**
 * The dashboard claims to show the one thing most worth acting on, so it
 * has to be the highest-scored signal that is still new — not the newest,
 * and never one the AI has not judged.
 */

const ORG = "org_top_signal";
const USER = "user_top_signal";
const CTX = { orgId: ORG, userId: USER };

let admin: Pool;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at)
       values ($1, 'Top signal', 'top-signal', now())`,
    [ORG],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'T', 'top@example.com')`, [
    USER,
  ]);
});

afterAll(async () => {
  await admin?.end();
});

async function insert(
  ref: string,
  score: number | null,
  status: string,
  fetchedMinutesAgo: number,
) {
  await admin.query(
    `insert into signals (org_id, source, source_ref, title, status, score, score_reason, suggestion, fetched_at)
       values ($1, 'rss', $2, $3, $4, $5, 'fordi', 'gør noget', now() - ($6 || ' minutes')::interval)`,
    [ORG, ref, `Signal ${ref}`, status, score, String(fetchedMinutesAgo)],
  );
}

describe("getTopSignal", () => {
  it("returns nothing when there is nothing new and scored", async () => {
    expect(await getTopSignal(CTX)).toBeNull();

    await insert("unscored", null, "new", 1);
    await insert("dismissed", 99, "dismissed", 1);
    await insert("saved", 98, "saved", 1);
    expect(await getTopSignal(CTX)).toBeNull();
  });

  it("picks the highest score, not the newest", async () => {
    await insert("newest-but-weak", 20, "new", 0);
    await insert("older-but-strong", 86, "new", 500);

    const top = await getTopSignal(CTX);
    expect(top?.title).toBe("Signal older-but-strong");
    expect(top?.score).toBe(86);
    expect(top?.suggestion).toBe("gør noget");
  });

  it("breaks a tie on how recently it arrived", async () => {
    await insert("tie-old", 86, "new", 900);
    await insert("tie-new", 86, "new", 2);
    expect((await getTopSignal(CTX))?.title).toBe("Signal tie-new");
  });
});
