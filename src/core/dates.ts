/**
 * Shared calendar helpers. All business dates in Haij are ISO strings
 * (yyyy-mm-dd) pinned to Europe/Copenhagen — the server may run in UTC,
 * but "today" on an invoice is the Danish today.
 */

export function todayInCopenhagen(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Pure date arithmetic on ISO strings; safe across DST because it runs in UTC. */
export function addDaysIso(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/** "2026-08-26" → "26.08.2026" (Danish short date). */
export function formatDateDa(dateIso: string): string {
  const [year, month, day] = dateIso.split("-");
  if (!year || !month || !day) return dateIso;
  return `${day}.${month}.${year}`;
}
