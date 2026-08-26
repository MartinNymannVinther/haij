import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  isoWeekMonday,
  isoWeekNumber,
  parseDurationToMinutes,
  shiftWeek,
  weekDates,
} from "@/modules/time/duration";

describe("parseDurationToMinutes", () => {
  it.each([
    ["1:30", 90],
    ["0:45", 45],
    ["10:05", 605],
    ["1,5", 90],
    ["1.5", 90],
    ["0,25", 15],
    ["2", 120],
    ["8", 480],
    ["45m", 45],
    ["45 min", 45],
    ["90 minutter", 90],
    ["2t", 120],
    ["2h", 120],
    ["1t 30m", 90],
    ["1t 30", 90],
    ["  1:30  ", 90],
  ])("parses %s as %d minutes", (input, expected) => {
    expect(parseDurationToMinutes(input)).toBe(expected);
  });

  it.each(["", "abc", "1:75", "-1", "0", "0:00", "25", "25t", "1441m", "12:00:00"])(
    "rejects %s",
    (input) => {
      expect(parseDurationToMinutes(input)).toBeNull();
    },
  );

  it("caps at 24 hours", () => {
    expect(parseDurationToMinutes("24t")).toBe(1440);
    expect(parseDurationToMinutes("1440m")).toBe(1440);
    expect(parseDurationToMinutes("1441m")).toBeNull();
  });
});

describe("formatMinutes", () => {
  it.each([
    [90, "1:30"],
    [45, "0:45"],
    [600, "10:00"],
    [605, "10:05"],
  ])("formats %d as %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});

describe("week helpers", () => {
  it("finds the ISO Monday for any weekday", () => {
    expect(isoWeekMonday(new Date(2026, 7, 26))).toBe("2026-08-24"); // Wednesday
    expect(isoWeekMonday(new Date(2026, 7, 24))).toBe("2026-08-24"); // Monday itself
    expect(isoWeekMonday(new Date(2026, 7, 30))).toBe("2026-08-24"); // Sunday
  });

  it("produces seven consecutive dates", () => {
    const days = weekDates("2026-08-24");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-08-24");
    expect(days[6]).toBe("2026-08-30");
  });

  it("shifts weeks across month boundaries", () => {
    expect(shiftWeek("2026-08-24", 1)).toBe("2026-08-31");
    expect(shiftWeek("2026-08-31", 1)).toBe("2026-09-07");
    expect(shiftWeek("2026-08-24", -1)).toBe("2026-08-17");
  });

  it("computes ISO week numbers, year boundaries included", () => {
    expect(isoWeekNumber("2026-08-26")).toBe(35);
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2027-01-01")).toBe(53); // 2026 has 53 ISO weeks
  });
});
