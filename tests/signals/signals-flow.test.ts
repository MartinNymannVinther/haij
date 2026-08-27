import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  addManualSignal,
  convertSignalToCompany,
  getSignalSettings,
  listSignals,
  refreshSignals,
  saveSignalSettings,
  setSignalFollowUp,
  setSignalStatus,
} from "@/modules/signals/service";
import { adminPool } from "../helpers/db";

/**
 * Signals flow through the real services with a fake network: configure
 * sources, fetch, dedupe, act on signals and convert them into CRM
 * companies. Scoring is unit-tested separately (LLM disabled here).
 */

const ORG_A = "org_flow_sig_a";
const ORG_B = "org_flow_sig_b";
const USER_A = "user_flow_sig_a";
const CTX_A = { orgId: ORG_A, userId: USER_A };
const CTX_B = { orgId: ORG_B, userId: "user_flow_sig_b" };

const TED_FIXTURE = {
  notices: [
    {
      "publication-number": "111-2026",
      "publication-date": "2026-08-25+02:00",
      "buyer-name": { dan: ["Aarhus Kommune"] },
      "notice-title": { dan: "Danmark – Rådgivning – Digitaliseringsstrategi" },
      links: { html: { DAN: "https://ted.europa.eu/da/notice/-/detail/111-2026" } },
    },
  ],
};

const CVR_FIXTURE = {
  hits: {
    hits: [
      {
        _source: {
          Vrvirksomhed: {
            cvrNummer: 44444442,
            sidstOpdateret: "2026-08-24T09:00:00.000+02:00",
            virksomhedMetadata: {
              nyesteNavn: { navn: "Nystartet Konsulenthus ApS" },
              nyesteHovedbranche: { branchekode: 702200, branchetekst: "Virksomhedsrådgivning" },
            },
          },
        },
      },
    ],
  },
};

const RSS_FIXTURE = `<rss><channel>
  <item><title>Kommune søger digital projektleder</title><link>https://example.dk/job/9</link><guid>job-9</guid>
  <description>Digital omstilling af borgerservice</description></item>
</channel></rss>`;

const fakeFetch: typeof fetch = async (url) => {
  const target = String(url);
  if (target.includes("ted.europa.eu")) {
    return new Response(JSON.stringify(TED_FIXTURE), { status: 200 });
  }
  if (target.includes("distribution.virk.dk")) {
    return new Response(JSON.stringify(CVR_FIXTURE), { status: 200 });
  }
  return new Response(RSS_FIXTURE, { status: 200 });
};

let admin: Pool;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Flow Sig A', 'flow-sig-a', now()), ($2, 'Flow Sig B', 'flow-sig-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Sig A', 'flow-sig-a@example.com'), ('user_flow_sig_b', 'Sig B', 'flow-sig-b@example.com')`,
    [USER_A],
  );
});

afterAll(async () => {
  await admin?.end();
});

describe("signals flow", () => {
  it("saves settings and refreshes from all configured sources", async () => {
    expect(await getSignalSettings(CTX_A)).toBeNull();
    await saveSignalSettings(CTX_A, {
      serviceProfile: "Digital strategi og udbudsrådgivning for kommuner og SMV'er",
      rssFeeds: [{ url: "https://example.dk/feed", label: "Jobindex" }],
      tedKeywords: "digitalisering, rådgivning",
      cvrBranchePrefixes: "7022",
    });

    const result = await refreshSignals(CTX_A, {
      fetchFn: fakeFetch,
      virkUser: "u",
      virkPassword: "p",
    });
    expect(result.inserted).toBe(3); // ted + cvr + rss
    expect(result.scored).toBe(0); // LLM disabled in tests
    expect(result.sources.map((s) => s.status)).toEqual(["ok", "ok", "ok"]);

    const { rows, counts } = await listSignals(CTX_A, "new");
    expect(counts.new).toBe(3);
    const sources = rows.map((r) => r.source).sort();
    expect(sources).toEqual(["cvr", "rss", "ted"]);
    const cvrSignal = rows.find((r) => r.source === "cvr");
    expect(cvrSignal?.companyCvr).toBe("44444442");
  });

  it("a second refresh dedupes on (source, ref)", async () => {
    const again = await refreshSignals(CTX_A, {
      fetchFn: fakeFetch,
      virkUser: "u",
      virkPassword: "p",
    });
    expect(again.inserted).toBe(0);
    const { counts } = await listSignals(CTX_A, "new");
    expect(counts.new).toBe(3);
  });

  it("status flow and follow-up dates", async () => {
    const { rows } = await listSignals(CTX_A, "new");
    const ted = rows.find((r) => r.source === "ted")!;
    const rss = rows.find((r) => r.source === "rss")!;

    await setSignalStatus(CTX_A, rss.id, "dismissed");
    await setSignalFollowUp(CTX_A, ted.id, "2026-09-01");

    const saved = await listSignals(CTX_A, "saved");
    expect(saved.rows.map((r) => r.id)).toContain(ted.id); // follow-up implies saved
    expect(saved.rows.find((r) => r.id === ted.id)?.followUpAt).toBe("2026-09-01");
    expect(saved.counts.dismissed).toBe(1);
  });

  it("converts a CVR signal into a company and links existing ones by CVR", async () => {
    const { rows } = await listSignals(CTX_A, "new");
    const cvrSignal = rows.find((r) => r.source === "cvr")!;
    const companyId = await convertSignalToCompany(CTX_A, cvrSignal.id);

    const company = await admin.query(`select name, cvr, org_id from companies where id = $1`, [
      companyId,
    ]);
    expect(company.rows[0]).toMatchObject({
      name: "Nystartet Konsulenthus ApS",
      cvr: "44444442",
      org_id: ORG_A,
    });
    const activity = await admin.query(
      `select count(*)::int as n from activities where company_id = $1 and metadata->>'event' = 'signal_converted'`,
      [companyId],
    );
    expect(activity.rows[0].n).toBe(1);

    // A manual signal with the same CVR links to the SAME company.
    await addManualSignal(CTX_A, {
      title: "Mødt på konference",
      note: "Talte med CEO om digital strategi",
      companyCvr: "44444442",
    });
    const manual = (await listSignals(CTX_A, "new")).rows.find((r) => r.source === "manual")!;
    const linkedId = await convertSignalToCompany(CTX_A, manual.id);
    expect(linkedId).toBe(companyId);
  });

  it("cross-tenant: org B sees nothing and cannot touch A's signals", async () => {
    const { rows, counts } = await listSignals(CTX_B, "new");
    expect(rows).toHaveLength(0);
    expect(counts.new ?? 0).toBe(0);
    const { rows: aRows } = await listSignals(CTX_A, "saved");
    await expect(setSignalStatus(CTX_B, aRows[0]!.id, "dismissed")).rejects.toThrow(
      "SIGNAL_NOT_FOUND",
    );
  });
});
