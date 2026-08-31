import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDateDa } from "@/core/dates";
import { formatOere } from "@/modules/invoicing/money";
import { formatMinutes } from "./duration";
import { periodLabel, type ExportContext } from "./report-export";
import type { TimeReport } from "./report";

/**
 * The hours as a document a customer can be handed, typically alongside
 * an invoice. Deliberately plain: this is documentation, not a sales
 * piece, and the only thing that matters is that every hour can be found
 * and the total matches the invoice.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, color: "#24221e" },
  title: { fontSize: 16, marginBottom: 4 },
  meta: { fontSize: 9, color: "#8a8479", marginBottom: 16 },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#24221e",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eae5dc",
  },
  groupHeading: { marginTop: 12, marginBottom: 4, fontSize: 10 },
  colDate: { width: "12%" },
  colWho: { width: "26%" },
  colWhat: { width: "44%" },
  colHours: { width: "18%", textAlign: "right" },
  totals: {
    flexDirection: "row",
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#24221e",
  },
});

function Rows({ rows }: { rows: TimeReport["rows"] }) {
  return (
    <>
      {rows.map((row) => (
        <View key={row.id} style={styles.tr} wrap={false}>
          <Text style={styles.colDate}>{formatDateDa(row.entryDate)}</Text>
          <Text style={styles.colWho}>
            {[row.projectName, row.roleName].filter(Boolean).join(" · ") || (row.companyName ?? "")}
          </Text>
          <Text style={styles.colWhat}>
            {[row.taskTitle, row.note].filter(Boolean).join(" · ")}
          </Text>
          <Text style={styles.colHours}>{formatMinutes(row.durationMinutes)}</Text>
        </View>
      ))}
    </>
  );
}

function TimeReportPdf({ report, context }: { report: TimeReport; context: ExportContext }) {
  const heading = context.invoiceNumber
    ? `Timeopgørelse til faktura ${context.invoiceNumber}`
    : "Timeopgørelse";

  return (
    <Document title={heading} author={context.orgName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.meta}>
          {[context.companyName, periodLabel(context.filters), context.orgName]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        <View style={styles.th} fixed>
          <Text style={styles.colDate}>Dato</Text>
          <Text style={styles.colWho}>Projekt og rolle</Text>
          <Text style={styles.colWhat}>Beskrivelse</Text>
          <Text style={styles.colHours}>Timer</Text>
        </View>

        {report.groups.length > 0 ? (
          report.groups.map((group) => (
            <View key={group.key}>
              <Text style={styles.groupHeading}>
                {group.label} — {formatMinutes(group.minutes)}
              </Text>
              <Rows rows={group.rows} />
            </View>
          ))
        ) : (
          <Rows rows={report.rows} />
        )}

        <View style={styles.totals}>
          <Text style={styles.colDate}>I alt</Text>
          <Text style={styles.colWho} />
          <Text style={styles.colWhat}>{formatOere(report.totalValueOere)} ekskl. moms</Text>
          <Text style={styles.colHours}>{formatMinutes(report.totalMinutes)}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderTimeReportPdf(
  report: TimeReport,
  context: ExportContext,
): Promise<Buffer> {
  return renderToBuffer(<TimeReportPdf report={report} context={context} />);
}
