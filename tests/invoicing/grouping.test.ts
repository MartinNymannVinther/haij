import { describe, expect, it } from "vitest";
import { groupEntriesIntoLines, type GroupableEntry } from "@/modules/invoicing/grouping";
import { lineNetOere } from "@/modules/invoicing/money";

/**
 * The one property that must never break: regrouping changes how the
 * invoice reads, never what it says. Same hours, same total, whichever
 * grouping is chosen.
 */

function entry(over: Partial<GroupableEntry> & { id: string }): GroupableEntry {
  return {
    entryDate: "2026-08-03",
    durationMinutes: 60,
    note: null,
    projectName: "Digitalt Transformationsprogram",
    taskTitle: null,
    roleName: "Transformation Lead",
    unitPriceOere: 80000,
    ...over,
  };
}

const august: GroupableEntry[] = [
  entry({ id: "a", entryDate: "2026-08-03", durationMinutes: 450 }),
  entry({ id: "b", entryDate: "2026-08-04", durationMinutes: 420 }),
  entry({ id: "c", entryDate: "2026-08-05", durationMinutes: 330 }),
];

function total(lines: ReturnType<typeof groupEntriesIntoLines>): number {
  return lines.reduce(
    (sum, line) => sum + lineNetOere(line.quantityHundredths, line.unitPriceOere),
    0,
  );
}

describe("groupEntriesIntoLines", () => {
  it("keeps the hours and the total identical across every grouping", () => {
    const perEntry = groupEntriesIntoLines(august, "entry");
    const expectedTotal = total(perEntry);
    const expectedHours = perEntry.reduce((sum, line) => sum + line.quantityHundredths, 0);

    for (const grouping of ["project", "role", "month"] as const) {
      const lines = groupEntriesIntoLines(august, grouping);
      expect(total(lines), grouping).toBe(expectedTotal);
      expect(
        lines.reduce((sum, line) => sum + line.quantityHundredths, 0),
        grouping,
      ).toBe(expectedHours);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.entryIds.sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("sums minutes before converting, so thirds of an hour do not drift", () => {
    // Three twenty-minute entries are exactly one hour together, but
    // 0.33 + 0.33 + 0.33 is not.
    const thirds = [
      entry({ id: "x", durationMinutes: 20 }),
      entry({ id: "y", durationMinutes: 20 }),
      entry({ id: "z", durationMinutes: 20 }),
    ];
    const [line] = groupEntriesIntoLines(thirds, "month");
    expect(line!.quantityHundredths).toBe(100);
  });

  it("never merges two rates into one line", () => {
    const mixed = [
      entry({ id: "cheap", unitPriceOere: 80000 }),
      entry({ id: "dear", unitPriceOere: 185000, entryDate: "2026-08-04" }),
    ];
    const lines = groupEntriesIntoLines(mixed, "month");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.unitPriceOere).sort((a, b) => a - b)).toEqual([80000, 185000]);
    expect(total(lines)).toBe(total(groupEntriesIntoLines(mixed, "entry")));
  });

  it("splits a period that spans two months when grouping by month", () => {
    const across = [
      entry({ id: "jul", entryDate: "2026-07-31" }),
      entry({ id: "aug", entryDate: "2026-08-01" }),
    ];
    const lines = groupEntriesIntoLines(across, "month");
    expect(lines.map((line) => line.description)).toEqual(["Timer juli 2026", "Timer august 2026"]);
  });

  it("names the group and the period it covers", () => {
    const [line] = groupEntriesIntoLines(august, "project");
    expect(line!.description).toBe("Digitalt Transformationsprogram · august 2026");

    const spanning = groupEntriesIntoLines(
      [entry({ id: "a", entryDate: "2026-06-02" }), entry({ id: "b", entryDate: "2026-08-27" })],
      "project",
    );
    expect(spanning[0]!.description).toBe(
      "Digitalt Transformationsprogram · 02.06.2026 – 27.08.2026",
    );
  });

  it("gives work outside the grouping a name of its own rather than a blank one", () => {
    const lines = groupEntriesIntoLines(
      [entry({ id: "a", projectName: null }), entry({ id: "b" })],
      "project",
    );
    expect(lines.map((line) => line.description)).toContain("Arbejde uden projekt · august 2026");
  });

  it("keeps one line per entry when nothing is grouped", () => {
    const lines = groupEntriesIntoLines(august, "entry");
    expect(lines).toHaveLength(3);
    expect(lines[0]!.description).toContain("03.08.2026");
    expect(lines[0]!.description).toContain("(Transformation Lead)");
  });

  it("reads chronologically whichever grouping is chosen", () => {
    const lines = groupEntriesIntoLines(
      [
        entry({ id: "late", entryDate: "2026-08-20" }),
        entry({ id: "early", entryDate: "2026-06-02" }),
      ],
      "month",
    );
    expect(lines.map((line) => line.entryIds[0])).toEqual(["early", "late"]);
  });
});
