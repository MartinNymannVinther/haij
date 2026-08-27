import { VAT_RATE_STANDARD_BP, type VatCategory } from "@/core/db/schema";

/**
 * All money passes through here as integer øre, quantities as integer
 * hundredths and VAT rates as basis points. No floats ever touch a stored
 * amount; the only divisions happen inside `round`, on integers, right
 * before an integer result.
 *
 * Rounding is half away from zero (symmetric): a credit note that negates
 * its invoice's quantities produces exactly the negated amounts, øre for
 * øre. `Math.round` would break that symmetry at -0.5.
 */
function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Net amount of a line: quantity (hundredths) × unit price (øre). */
export function lineNetOere(quantityHundredths: number, unitPriceOere: number): number {
  return roundHalfAwayFromZero((quantityHundredths * unitPriceOere) / 100);
}

/** VAT of a line from its net amount and rate in basis points (2500 = 25%). */
export function lineVatOere(netOere: number, vatRateBp: number): number {
  return roundHalfAwayFromZero((netOere * vatRateBp) / 10_000);
}

/**
 * VAT is calculated per line and the totals are sums of the stored line
 * amounts — the same convention Danish accounting systems (Dinero,
 * e-conomic) use, so pushed invoices match øre for øre.
 */
export function invoiceTotals(lines: ReadonlyArray<{ lineNetOere: number; lineVatOere: number }>): {
  netOere: number;
  vatOere: number;
  grossOere: number;
} {
  let netOere = 0;
  let vatOere = 0;
  for (const line of lines) {
    netOere += line.lineNetOere;
    vatOere += line.lineVatOere;
  }
  return { netOere, vatOere, grossOere: netOere + vatOere };
}

/** The default rate for a VAT category; 'zero' and 'exempt' both carry 0%. */
export function vatRateForCategory(category: VatCategory): number {
  return category === "standard" ? VAT_RATE_STANDARD_BP : 0;
}

/** 90 minutes → 150 hundredths of an hour. */
export function minutesToQuantityHundredths(minutes: number): number {
  return roundHalfAwayFromZero((minutes * 100) / 60);
}

/**
 * Parses a Danish-style decimal the way people type it: "1.234,56",
 * "1234,56", "1,5", "1234", "12.50" and "kr. 950" all work. When both
 * separators appear, the last one is the decimal separator; a lone dot is
 * a decimal separator unless the digits form pure thousand grouping
 * ("1.234" is one thousand two hundred and thirty-four).
 */
function parseDanishDecimal(input: string): number | null {
  let text = input
    .replace(/kr\.?|dkk/gi, "")
    .replace(/[\s  ]/g, "")
    .replace(/−/g, "-"); // real minus sign → ascii
  if (!/^-?[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    if (text.indexOf(",") !== lastComma) return null; // "1,2,3"
    normalized = text.replace(",", ".");
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text;
    if ((normalized.match(/\./g) ?? []).length > 1) return null;
  } else {
    normalized = text;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** "1.234,56" → 123456 øre. Null when the input isn't a number. */
export function parseKronerToOere(input: string): number | null {
  const value = parseDanishDecimal(input);
  if (value === null) return null;
  const oere = roundHalfAwayFromZero(value * 100);
  return Number.isSafeInteger(oere) ? oere : null;
}

/** "1,5" → 150 hundredths. Null when the input isn't a number. */
export function parseQuantityToHundredths(input: string): number | null {
  const value = parseDanishDecimal(input);
  if (value === null) return null;
  const hundredths = roundHalfAwayFromZero(value * 100);
  return Number.isSafeInteger(hundredths) ? hundredths : null;
}

const kronerFormat = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantityFormat = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 123456 → "1.234,56 kr." */
export function formatOere(oere: number): string {
  return kronerFormat.format(oere / 100);
}

/** 123456 → "1.234,56" (for tables and form defaults). */
export function formatOereBare(oere: number): string {
  return numberFormat.format(oere / 100);
}

/** 150 → "1,5" */
export function formatQuantityHundredths(hundredths: number): string {
  return quantityFormat.format(hundredths / 100);
}

/** Form default value: 123456 → "1234,56" (no thousand grouping). */
export function oereToInputValue(oere: number): string {
  return (oere / 100).toFixed(2).replace(".", ",");
}
