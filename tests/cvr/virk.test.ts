import { describe, expect, it } from "vitest";
import { composeVirkAddress, VirkCvrProvider } from "@/core/cvr/virk";
import fixture from "../fixtures/virk-company.json";

function fetchReturning(
  body: unknown,
  status = 200,
): {
  fetchFn: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchFn, calls };
}

describe("VirkCvrProvider", () => {
  it("maps virksomhedMetadata to the adapter shape", async () => {
    const { fetchFn } = fetchReturning(fixture);
    const provider = new VirkCvrProvider("user", "secret", fetchFn);
    const result = await provider.lookup("10150817");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.company).toMatchObject({
      cvr: "10150817",
      name: "ERHVERVSSTYRELSEN",
      address: "Langelinie Allé 17",
      zipcode: "2100",
      city: "København Ø",
      phone: "72200030",
      email: "erst@erst.dk",
      website: "www.erst.dk",
      industryCode: "841100",
      industryText: "Generelle offentlige tjenester",
      companyType: "Statslig administrativ enhed",
    });
  });

  it("sends basic auth and asks only for the metadata projection", async () => {
    const { fetchFn, calls } = fetchReturning(fixture);
    const provider = new VirkCvrProvider("user", "secret", fetchFn);
    await provider.lookup("10150817");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://distribution.virk.dk/cvr-permanent/virksomhed/_search");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("user:secret").toString("base64")}`);
    const body = JSON.parse(String(call.init?.body));
    expect(body.query.term["Vrvirksomhed.cvrNummer"]).toBe(10150817);
    expect(body._source).toContain("Vrvirksomhed.virksomhedMetadata");
    expect(body.size).toBe(1);
  });

  it("treats zero hits as not_found (old and new total shapes)", async () => {
    for (const total of [0, { value: 0 }]) {
      const { fetchFn } = fetchReturning({ hits: { total, hits: [] } });
      const provider = new VirkCvrProvider("user", "secret", fetchFn);
      expect(await provider.lookup("99999999")).toEqual({ status: "not_found" });
    }
  });

  it("treats 401 as unavailable, never not_found", async () => {
    const { fetchFn } = fetchReturning({ error: "unauthorized" }, 401);
    const provider = new VirkCvrProvider("user", "wrong", fetchFn);
    expect(await provider.lookup("10150817")).toEqual({ status: "unavailable" });
  });

  it("treats network errors and malformed payloads as unavailable", async () => {
    const failing: typeof fetch = async () => {
      throw new Error("down");
    };
    expect(await new VirkCvrProvider("u", "p", failing).lookup("10150817")).toEqual({
      status: "unavailable",
    });
    const { fetchFn } = fetchReturning(null);
    // A hit without a usable name must not be presented as found.
    const noName = {
      hits: { total: 1, hits: [{ _source: { Vrvirksomhed: { cvrNummer: 1 } } }] },
    };
    const { fetchFn: noNameFetch } = fetchReturning(noName);
    expect(await new VirkCvrProvider("u", "p", noNameFetch).lookup("10150817")).toEqual({
      status: "unavailable",
    });
    void fetchFn;
  });
});

describe("composeVirkAddress", () => {
  it("handles number ranges, letters, floor and door", () => {
    expect(
      composeVirkAddress({
        vejnavn: "Nørregade",
        husnummerFra: 7,
        bogstavFra: "B",
        etage: "2",
        sidedoer: "th",
      }),
    ).toBe("Nørregade 7B, 2. th");
    expect(
      composeVirkAddress({ vejnavn: "Åboulevarden", husnummerFra: 21, husnummerTil: 23 }),
    ).toBe("Åboulevarden 21-23");
    expect(composeVirkAddress({ conavn: "Regus", vejnavn: "Havnegade", husnummerFra: 39 })).toBe(
      "c/o Regus, Havnegade 39",
    );
    expect(composeVirkAddress(null)).toBeNull();
    expect(composeVirkAddress({})).toBeNull();
  });
});
