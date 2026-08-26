/**
 * Duration input parsing for time entries. Accepted forms (Danish habits):
 *
 *   "1:30"  -> 90    (hours:minutes)
 *   "1,5"   -> 90    (decimal hours, comma or dot)
 *   "2"     -> 120   (bare number = hours)
 *   "45m"   -> 45    (explicit minutes)
 *   "90 min"-> 90
 *   "2t"    -> 120   (t = timer; h also accepted)
 *   "1t 30m"-> 90
 *
 * Result is whole minutes, clamped to the schema bounds 1..1440, or null
 * for anything unparsable.
 */
export function parseDurationToMinutes(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  let minutes: number | null = null;

  const hoursColonMinutes = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  const explicitMinutes = /^(\d{1,4})\s?(?:m|min|minutter)$/.exec(text);
  const hoursAndMinutes = /^(\d{1,2})\s?(?:t|h)\s?(?:(\d{1,2})\s?(?:m|min)?)?$/.exec(text);
  const decimalHours = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(text);

  if (hoursColonMinutes) {
    minutes = Number(hoursColonMinutes[1]) * 60 + Number(hoursColonMinutes[2]);
  } else if (explicitMinutes) {
    minutes = Number(explicitMinutes[1]);
  } else if (hoursAndMinutes) {
    minutes = Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] ?? 0);
  } else if (decimalHours) {
    const whole = Number(decimalHours[1]);
    const fraction = decimalHours[2] ? Number(`0.${decimalHours[2]}`) : 0;
    minutes = Math.round((whole + fraction) * 60);
  }

  if (minutes === null || !Number.isFinite(minutes)) return null;
  if (minutes < 1 || minutes > 1440) return null;
  return minutes;
}

/** 90 -> "1:30", 45 -> "0:45". */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** ISO date (yyyy-mm-dd) of the Monday of the week containing `date`. */
export function isoWeekMonday(date: Date): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7; // Sunday -> 7
  utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc.toISOString().slice(0, 10);
}

/** The seven ISO dates of the week starting at `mondayIso`. */
export function weekDates(mondayIso: string): string[] {
  const [year, month, dayOfMonth] = mondayIso.split("-").map(Number);
  const monday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, dayOfMonth ?? 1));
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + index);
    return d.toISOString().slice(0, 10);
  });
}

/** Shift an ISO Monday by +/- n weeks. */
export function shiftWeek(mondayIso: string, weeks: number): string {
  const [year, month, dayOfMonth] = mondayIso.split("-").map(Number);
  const d = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, dayOfMonth ?? 1));
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** ISO 8601 week number for an ISO date string. */
export function isoWeekNumber(dateIso: string): number {
  const [year, month, dayOfMonth] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, dayOfMonth ?? 1));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
