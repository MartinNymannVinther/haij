import { describe, expect, it } from "vitest";
import { CvrapiDkProvider } from "@/core/cvr/cvrapi-dk";
import { normalizeCvr } from "@/core/cvr/validate";
import fixture from "../fixtures/cvrapi-company.json";

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("normalizeCvr", () => {
  it.each([
    ["12345678", "12345678"],
    ["  12 34 56 78  ", "12345678"],
    ["DK-12345678", "12345678"],
    ["dk 12345678", "12345678"],
    ["12.34.56.78", "12345678"],
  ])("accepts %s as %s", (input, expected) => {
    expect(normalizeCvr(input)).toBe(expected);
  });

  it.each(["1234567", "123456789", "1234567a", "", "cvr", "12345678 extra"])(
    "rejects %s",
    (input) => {
      expect(normalizeCvr(input)).toBeNull();
    },
  );
});

describe("CvrapiDkProvider", () => {
  const ua = "Haij (https://haij.dk) - test@example.com";

  it("maps a company response to the adapter shape", async () => {
    const provider = new CvrapiDkProvider(ua, fetchReturning(fixture));
    const result = await provider.lookup("10150817");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.company).toMatchObject({
      cvr: "10150817",
      name: "Eksempel Rådgivning ApS",
      address: "Havnegade 12, 2. th",
      zipcode: "1058",
      city: "København K",
      industryCode: "702200",
      industryText: "Virksomhedsrådgivning og anden rådgivning om driftsledelse",
      companyType: "Anpartsselskab",
    });
    expect(result.company.raw).toEqual(fixture);
  });

  it("pads a short vat number to 8 digits", async () => {
    const provider = new CvrapiDkProvider(ua, fetchReturning({ ...fixture, vat: 1015081 }));
    const result = await provider.lookup("01015081");
    expect(result.status === "found" && result.company.cvr).toBe("01015081");
  });

  it("treats NOT_FOUND as not_found", async () => {
    const provider = new CvrapiDkProvider(ua, fetchReturning({ error: "NOT_FOUND" }, 404));
    expect(await provider.lookup("99999999")).toEqual({ status: "not_found" });
  });

  it("treats QUOTA_EXCEEDED as unavailable, never not_found", async () => {
    const provider = new CvrapiDkProvider(ua, fetchReturning({ error: "QUOTA_EXCEEDED" }, 403));
    expect(await provider.lookup("10150817")).toEqual({ status: "unavailable" });
  });

  it("treats network errors as unavailable", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("network down");
    };
    const provider = new CvrapiDkProvider(ua, failingFetch);
    expect(await provider.lookup("10150817")).toEqual({ status: "unavailable" });
  });

  it("treats malformed payloads as unavailable", async () => {
    const provider = new CvrapiDkProvider(ua, async () => new Response("<html>", { status: 200 }));
    expect(await provider.lookup("10150817")).toEqual({ status: "unavailable" });
  });
});
