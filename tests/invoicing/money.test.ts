import { describe, expect, it } from "vitest";
import {
  formatOere,
  formatQuantityHundredths,
  invoiceTotals,
  lineNetOere,
  lineVatOere,
  minutesToQuantityHundredths,
  oereToInputValue,
  parseKronerToOere,
  parseQuantityToHundredths,
  vatRateForCategory,
} from "@/modules/invoicing/money";

describe("line arithmetic (integer øre)", () => {
  it("multiplies quantity hundredths by unit price", () => {
    // 1,5 time à 1.200,00 kr. = 1.800,00 kr.
    expect(lineNetOere(150, 120000)).toBe(180000);
    // 0,25 time à 950,00 kr. = 237,50 kr.
    expect(lineNetOere(25, 95000)).toBe(23750);
    // 1 stk à 0,01 kr.
    expect(lineNetOere(100, 1)).toBe(1);
  });

  it("rounds half away from zero", () => {
    // 0,25 × 0,50 kr. = 0,125 kr. → 13 øre, and -0,125 → -13, never -12.
    expect(lineNetOere(25, 50)).toBe(13);
    expect(lineNetOere(-25, 50)).toBe(-13);
  });

  it("credit notes mirror their invoice øre for øre", () => {
    const cases: Array<[number, number]> = [
      [150, 120000],
      [25, 50],
      [33, 99999],
      [1, 1],
    ];
    for (const [qty, price] of cases) {
      const net = lineNetOere(qty, price);
      const negNet = lineNetOere(-qty, price);
      expect(negNet).toBe(-net);
      expect(lineVatOere(negNet, 2500)).toBe(-lineVatOere(net, 2500));
    }
  });

  it("computes 25% VAT from the net amount", () => {
    expect(lineVatOere(180000, 2500)).toBe(45000);
    expect(lineVatOere(23750, 2500)).toBe(5938); // 5.937,5 øre rounds up
    expect(lineVatOere(1, 2500)).toBe(0); // 0,25 øre rounds down
    expect(lineVatOere(2, 2500)).toBe(1); // 0,5 øre rounds up
    expect(lineVatOere(180000, 0)).toBe(0);
  });

  it("maps VAT categories to rates", () => {
    expect(vatRateForCategory("standard")).toBe(2500);
    expect(vatRateForCategory("zero")).toBe(0);
    expect(vatRateForCategory("exempt")).toBe(0);
  });
});

describe("invoiceTotals", () => {
  it("sums stored line amounts (per-line VAT convention)", () => {
    const totals = invoiceTotals([
      { lineNetOere: 180000, lineVatOere: 45000 },
      { lineNetOere: 23750, lineVatOere: 5938 },
    ]);
    expect(totals).toEqual({ netOere: 203750, vatOere: 50938, grossOere: 254688 });
  });

  it("handles empty and negative (credit note) lines", () => {
    expect(invoiceTotals([])).toEqual({ netOere: 0, vatOere: 0, grossOere: 0 });
    expect(
      invoiceTotals([
        { lineNetOere: -180000, lineVatOere: -45000 },
        { lineNetOere: -23750, lineVatOere: -5938 },
      ]),
    ).toEqual({ netOere: -203750, vatOere: -50938, grossOere: -254688 });
  });
});

describe("minutesToQuantityHundredths", () => {
  it("converts tracked minutes to hours in hundredths", () => {
    expect(minutesToQuantityHundredths(90)).toBe(150);
    expect(minutesToQuantityHundredths(60)).toBe(100);
    expect(minutesToQuantityHundredths(45)).toBe(75);
    expect(minutesToQuantityHundredths(1)).toBe(2); // 1,666… → 2
    expect(minutesToQuantityHundredths(20)).toBe(33); // 33,33 → 33
  });
});

describe("parseKronerToOere (Danish input)", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234", 123400],
    ["1,5", 150],
    ["12.50", 1250], // dot as decimal separator
    ["1.234", 123400], // dot as thousand grouping
    ["12.345.678", 1234567800],
    ["kr. 950", 95000],
    ["950 kr.", 95000],
    ["950 DKK", 95000],
    ["-250,75", -25075],
    ["−250,75", -25075], // real minus sign
    ["0", 0],
    ["0,999", 100], // rounds to whole øre
    ["1 234,56", 123456], // space grouping
  ])("parses %s → %d øre", (input, expected) => {
    expect(parseKronerToOere(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "12..5", "1.23.45", "kr."])("rejects %j", (input) => {
    expect(parseKronerToOere(input)).toBeNull();
  });

  it("parses mixed separators by last-wins", () => {
    expect(parseKronerToOere("1.234,5")).toBe(123450);
    expect(parseKronerToOere("1,234.5")).toBe(123450); // English-style
  });
});

describe("parseQuantityToHundredths", () => {
  it("parses hours the same way durations render", () => {
    expect(parseQuantityToHundredths("1,5")).toBe(150);
    expect(parseQuantityToHundredths("0,25")).toBe(25);
    expect(parseQuantityToHundredths("8")).toBe(800);
    expect(parseQuantityToHundredths("-1")).toBe(-100);
    expect(parseQuantityToHundredths("x")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats øre as Danish kroner", () => {
    // Intl separates amount and unit with a non-breaking space.
    const plain = (oere: number) => formatOere(oere).replace(/[  ]/g, " ");
    expect(plain(123456)).toBe("1.234,56 kr.");
    expect(plain(0)).toBe("0,00 kr.");
    expect(plain(-25075)).toBe("-250,75 kr.");
  });

  it("formats quantities and input values", () => {
    expect(formatQuantityHundredths(150)).toBe("1,5");
    expect(formatQuantityHundredths(100)).toBe("1");
    expect(formatQuantityHundredths(25)).toBe("0,25");
    expect(oereToInputValue(123456)).toBe("1234,56");
  });
});
