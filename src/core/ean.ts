/**
 * EAN/GLN validation for Danish public-sector invoicing.
 *
 * A GLN is thirteen digits where the last one is a GS1 modulo-10 check
 * digit. Checking the shape alone is not enough: a mistyped EAN is a
 * well-formed number that routes an invoice to nobody, and the sender
 * hears nothing back. Catching it in the form is the only place a human
 * is still in the room.
 */

export function normalizeEan(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

export function isValidEan(value: string): boolean {
  const digits = normalizeEan(value);
  if (!/^[0-9]{13}$/.test(digits)) return false;

  // GS1 modulo 10: weights alternate 3 and 1 from the right, excluding
  // the check digit itself.
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = digits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits.charCodeAt(12) - 48;
}
