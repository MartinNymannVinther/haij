import { describe, expect, it } from "vitest";
import { CvrEventsAdapter } from "@/modules/signals/adapters/cvr-events";
import { RssAdapter } from "@/modules/signals/adapters/rss";
import { TedAdapter } from "@/modules/signals/adapters/ted";

function fetchReturning(
  body: unknown,
  status = 200,
  asText = false,
): { fetchFn: typeof fetch; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(asText ? String(body) : JSON.stringify(body), { status });
  };
  return { fetchFn, calls };
}

describe("TedAdapter", () => {
  const fixture = {
    notices: [
      {
        "publication-number": "590037-2026",
        "publication-date": "2026-08-26+02:00",
        "buyer-name": { dan: ["Kerteminde Kommune"] },
        "notice-title": { dan: "Danmark – Rådgivning – Digital transformation" },
        links: { html: { DAN: "https://ted.europa.eu/da/notice/-/detail/590037-2026" } },
      },
      { "publication-number": "1-2026" }, // no title -> dropped
    ],
  };

  it("builds a DNK+keywords query and maps notices", async () => {
    const { fetchFn, calls } = fetchReturning(fixture);
    const adapter = new TedAdapter(["digitalisering", "it-rådgivning"], fetchFn);
    const result = await adapter.fetchNew();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      source: "ted",
      sourceRef: "590037-2026",
      title: "Danmark – Rådgivning – Digital transformation",
      summary: "Ordregiver: Kerteminde Kommune",
      url: "https://ted.europa.eu/da/notice/-/detail/590037-2026",
    });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.query).toContain("place-of-performance IN (DNK)");
    expect(body.query).toContain('"digitalisering" OR "it-rådgivning"');
  });

  it("skips without keywords and degrades on failure", async () => {
    expect(await new TedAdapter([], fetchReturning({}).fetchFn).fetchNew()).toMatchObject({
      status: "skipped",
    });
    expect(
      await new TedAdapter(["x"], fetchReturning({}, 500).fetchFn).fetchNew(),
    ).toMatchObject({ status: "unavailable" });
  });
});

describe("CvrEventsAdapter", () => {
  const fixture = {
    hits: {
      hits: [
        {
          _source: {
            Vrvirksomhed: {
              cvrNummer: 12345674,
              sidstOpdateret: "2026-08-25T10:00:00.000+02:00",
              virksomhedMetadata: {
                nyesteNavn: { navn: "Ny Software ApS" },
                nyesteHovedbranche: { branchekode: 620100, branchetekst: "Computerprogrammering" },
                nyesteBeliggenhedsadresse: {
                  vejnavn: "Kystvejen",
                  husnummerFra: 3,
                  postnummer: 8000,
                  postdistrikt: "Aarhus C",
                },
                stiftelsesDato: "2026-08-20",
              },
            },
          },
        },
      ],
    },
  };

  it("queries branch ranges since 14 days and maps companies", async () => {
    const { fetchFn, calls } = fetchReturning(fixture);
    const adapter = new CvrEventsAdapter(
      ["62", "7022"],
      "user",
      "pass",
      fetchFn,
      () => new Date("2026-08-26T12:00:00Z"),
    );
    const result = await adapter.fetchNew();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.items[0]).toMatchObject({
      source: "cvr",
      sourceRef: "12345674",
      title: "Ny Software ApS",
      companyCvr: "12345674",
      url: "https://datacvr.virk.dk/enhed/virksomhed/12345674",
    });
    expect(result.items[0]!.summary).toContain("Computerprogrammering");
    expect(result.items[0]!.summary).toContain("Kystvejen 3");

    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.query.bool.must[0].range["Vrvirksomhed.sidstOpdateret"].gte).toBe("2026-08-12");
    expect(body.query.bool.should).toHaveLength(2);
    expect(
      body.query.bool.should[0].range[
        "Vrvirksomhed.virksomhedMetadata.nyesteHovedbranche.branchekode"
      ],
    ).toEqual({ gte: 620000, lte: 629999 });
    expect(
      body.query.bool.should[1].range[
        "Vrvirksomhed.virksomhedMetadata.nyesteHovedbranche.branchekode"
      ],
    ).toEqual({ gte: 702200, lte: 702299 });
  });

  it("skips without prefixes and reports missing credentials", async () => {
    const none = new CvrEventsAdapter([], "u", "p", fetchReturning({}).fetchFn);
    expect(await none.fetchNew()).toMatchObject({ status: "skipped" });
    const noCreds = new CvrEventsAdapter(["62"], undefined, undefined, fetchReturning({}).fetchFn);
    expect(await noCreds.fetchNew()).toMatchObject({ status: "unavailable" });
  });
});

describe("RssAdapter", () => {
  const xml = `<rss><channel>
    <item><title>Jobopslag: CTO søges</title><link>https://example.dk/1</link><guid>g1</guid></item>
  </channel></rss>`;

  it("fetches feeds and hashes stable refs", async () => {
    const { fetchFn } = fetchReturning(xml, 200, true);
    const adapter = new RssAdapter([{ url: "https://example.dk/feed" }], fetchFn);
    const result = await adapter.fetchNew();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.sourceRef).toMatch(/^[0-9a-f]{64}$/);
    expect(result.items[0]!.title).toBe("Jobopslag: CTO søges");

    // Same feed + item -> same ref (dedupe across fetches).
    const again = await new RssAdapter(
      [{ url: "https://example.dk/feed" }],
      fetchReturning(xml, 200, true).fetchFn,
    ).fetchNew();
    if (again.status === "ok") {
      expect(again.items[0]!.sourceRef).toBe(result.items[0]!.sourceRef);
    }
  });

  it("skips without feeds and reports total failure", async () => {
    expect(await new RssAdapter([], fetchReturning("", 200, true).fetchFn).fetchNew()).toMatchObject(
      { status: "skipped" },
    );
    const failing: typeof fetch = async () => {
      throw new Error("down");
    };
    expect(
      await new RssAdapter([{ url: "https://example.dk/feed" }], failing).fetchNew(),
    ).toMatchObject({ status: "unavailable" });
  });
});
