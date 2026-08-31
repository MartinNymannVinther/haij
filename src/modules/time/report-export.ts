import { formatDateDa } from "@/core/dates";
import { buildXlsx, type Sheet } from "@/core/xlsx";
import { formatMinutes } from "./duration";
import type { ReportFilters, TimeReport } from "./report";

/**
 * The report as a file. Both formats are built from the same rows the
 * screen shows, so what a customer receives and what Martin looked at
 * cannot differ.
 */

export type ExportContext = {
  orgName: string;
  companyName?: string | null;
  invoiceNumber?: number | null;
  filters: ReportFilters;
};

/** A period in words, for the file's own heading. */
export function periodLabel(filters: ReportFilters): string {
  if (filters.from && filters.to) {
    return `${formatDateDa(filters.from)} – ${formatDateDa(filters.to)}`;
  }
  if (filters.from) return `fra ${formatDateDa(filters.from)}`;
  if (filters.to) return `til ${formatDateDa(filters.to)}`;
  return "hele perioden";
}

/**
 * Hours as a decimal number rather than a formatted string: a recipient
 * who opens this in Excel wants to sum the column, and "7:30" does not
 * add up. The screen keeps the readable form.
 */
function hours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function buildReportSheet(report: TimeReport, context: ExportContext): Buffer {
  const sheet: Sheet = {
    name: context.invoiceNumber ? `Timer faktura ${context.invoiceNumber}` : "Timer",
    columns: [
      { header: "Dato", width: 12 },
      { header: "Kunde", width: 28 },
      { header: "Projekt", width: 30 },
      { header: "Opgave", width: 24 },
      { header: "Rolle", width: 22 },
      { header: "Beskrivelse", width: 44 },
      { header: "Timer", width: 10 },
      { header: "Timepris", width: 12 },
      { header: "Beløb ekskl. moms", width: 18 },
      { header: "Faktura", width: 12 },
    ],
    rows: report.rows.map((row) => [
      new Date(`${row.entryDate}T12:00:00Z`),
      row.companyName,
      row.projectName,
      row.taskTitle,
      row.roleName,
      row.note,
      hours(row.durationMinutes),
      row.rateOere / 100,
      row.valueOere / 100,
      row.invoiceNumber ?? (row.invoiceStatus === "draft" ? "Udkast" : ""),
    ]),
  };

  // A totals row, separated by a blank one so a filter or a sort does not
  // drag it up among the entries.
  sheet.rows.push([]);
  sheet.rows.push([
    "I alt",
    null,
    null,
    null,
    null,
    null,
    hours(report.totalMinutes),
    null,
    report.totalValueOere / 100,
    null,
  ]);

  return buildXlsx(sheet);
}

/** The same table as plain rows, for the PDF renderer. */
export function reportTableRows(report: TimeReport): string[][] {
  return report.rows.map((row) => [
    formatDateDa(row.entryDate),
    row.companyName ?? "",
    [row.projectName, row.taskTitle].filter(Boolean).join(" · "),
    row.note ?? "",
    formatMinutes(row.durationMinutes),
  ]);
}
