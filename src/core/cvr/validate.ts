/**
 * Normalizes user input to a bare CVR number: strips whitespace, dots and
 * an optional DK prefix. Returns null when the result is not 8 digits.
 *
 * Deliberately no modulus-11 check: numbers issued after 2019 are not
 * guaranteed to satisfy it, and the lookup decides existence anyway.
 */
export function normalizeCvr(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/^DK[\s-]*/, "")
    .replace(/[\s.-]/g, "");
  return /^[0-9]{8}$/.test(cleaned) ? cleaned : null;
}
