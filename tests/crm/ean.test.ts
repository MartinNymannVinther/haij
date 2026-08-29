import { describe, expect, it } from "vitest";
import { isValidEan, normalizeEan } from "@/core/ean";

/**
 * A mistyped EAN is a well-formed number that quietly routes an invoice
 * to nobody, so the check digit has to be verified, not just the shape.
 */
describe("isValidEan", () => {
  it("accepts numbers with a correct GS1 check digit", () => {
    // Both check out by hand: 5798765432109 sums to 122 -> check 8,
    // 5791234567890 sums to 87 -> check 3.
    expect(isValidEan("5798765432109")).toBe(true);
    expect(isValidEan("5791234567890")).toBe(true);
  });

  it("rejects a single mistyped digit", () => {
    expect(isValidEan("5798765432109")).toBe(true);
    expect(isValidEan("5798009811579")).toBe(false);
    expect(isValidEan("5798009811678")).toBe(false);
  });

  it("rejects anything that is not thirteen digits", () => {
    expect(isValidEan("")).toBe(false);
    expect(isValidEan("579800981157")).toBe(false);
    expect(isValidEan("57987654321090")).toBe(false);
    expect(isValidEan("5798009811A78")).toBe(false);
  });

  it("ignores the spaces and dashes people paste in", () => {
    expect(normalizeEan("5798 7654 32109")).toBe("5798765432109");
    expect(isValidEan("5798-7654-32109")).toBe(true);
  });
});
