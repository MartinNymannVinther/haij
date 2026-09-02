import { describe, expect, it } from "vitest";
import { isValidEan, normalizeEan } from "@/core/ean";

/**
 * A mistyped EAN is a well-formed number that quietly routes an invoice
 * to nobody, so the check digit has to be verified, not just the shape.
 */
describe("isValidEan", () => {
  it("accepts numbers with a correct GS1 check digit", () => {
    // Both check out by hand: 5798765432109 sums to 111 -> check 9,
    // 5791234567890 sums to 130 -> check 0.
    expect(isValidEan("5798765432109")).toBe(true);
    expect(isValidEan("5791234567890")).toBe(true);
  });

  it("rejects a single mistyped digit", () => {
    expect(isValidEan("5798765432109")).toBe(true);
    expect(isValidEan("5798765432100")).toBe(false);
    expect(isValidEan("5798765432209")).toBe(false);
  });

  it("rejects anything that is not thirteen digits", () => {
    expect(isValidEan("")).toBe(false);
    expect(isValidEan("579876543210")).toBe(false);
    expect(isValidEan("57987654321090")).toBe(false);
    expect(isValidEan("5798765432A09")).toBe(false);
  });

  it("ignores the spaces and dashes people paste in", () => {
    expect(normalizeEan("5798 7654 32109")).toBe("5798765432109");
    expect(isValidEan("5798-7654-32109")).toBe(true);
  });
});
