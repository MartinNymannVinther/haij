import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDateDa } from "@/core/dates";
import type { invoiceLines, invoices } from "@/core/db/schema";
import { formatOereBare, formatQuantityHundredths } from "./money";

/**
 * The invoice document itself — Danish layout covering the fakturakrav
 * (momsbekendtgørelsen §57): sequential number, dates, both parties with
 * CVR, nature and quantity of the services, unit prices ex VAT, the VAT
 * base with rate and amount, and the payment terms.
 *
 * Built-in Helvetica covers æøå (WinAnsi), so no font files ship with
 * the app. Word hyphenation is off — amounts must never break.
 */

Font.registerHyphenationCallback((word) => [word]);

type Invoice = typeof invoices.$inferSelect;
type Line = typeof invoiceLines.$inferSelect;

const UNIT_LABELS: Record<string, string> = {
  hour: "timer",
  day: "dage",
  piece: "stk.",
  fixed: "fast",
};

const granite = "#1f2427";
const muted = "#6b7280";
const rule = "#d7dadd";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: granite,
    paddingTop: 48,
    paddingHorizontal: 48,
    paddingBottom: 64,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  wordmark: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  partyRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  partyLabel: { fontSize: 7, color: muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  partyName: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  partyLine: { marginBottom: 1.5 },
  metaBox: { flexDirection: "row", gap: 24, marginBottom: 24 },
  metaItem: { minWidth: 70 },
  metaLabel: { fontSize: 7, color: muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  metaValue: { fontFamily: "Helvetica-Bold" },
  table: { marginBottom: 16 },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: granite,
    paddingBottom: 4,
    marginBottom: 2,
  },
  thText: { fontSize: 7, color: muted, textTransform: "uppercase", letterSpacing: 0.8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: rule, paddingVertical: 5 },
  colDesc: { flexGrow: 1, flexShrink: 1, paddingRight: 8 },
  colQty: { width: 52, textAlign: "right" },
  colUnit: { width: 42, textAlign: "right" },
  colPrice: { width: 76, textAlign: "right" },
  colAmount: { width: 84, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 220, marginBottom: 24 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: granite,
    marginTop: 2,
    paddingTop: 5,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  note: { marginBottom: 16, color: muted },
  payment: { borderTopWidth: 0.5, borderTopColor: rule, paddingTop: 10, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: rule,
    paddingTop: 6,
    fontSize: 7,
    color: muted,
    textAlign: "center",
  },
});

function money(oere: number): string {
  return `${formatOereBare(oere).replace(/[  ]/g, " ")} kr.`;
}

export function InvoicePdf({ invoice, lines }: { invoice: Invoice; lines: Line[] }) {
  const isCredit = invoice.type === "credit_note";
  const title = isCredit ? "KREDITNOTA" : "FAKTURA";

  // Fakturakrav: the VAT base and rate must be specified. One summary row
  // per distinct rate covers mixed invoices too.
  const vatGroups = new Map<number, { baseOere: number; vatOere: number }>();
  for (const line of lines) {
    const group = vatGroups.get(line.vatRateBp) ?? { baseOere: 0, vatOere: 0 };
    group.baseOere += line.lineNetOere;
    group.vatOere += line.lineVatOere;
    vatGroups.set(line.vatRateBp, group);
  }

  return (
    <Document
      title={`${isCredit ? "Kreditnota" : "Faktura"} ${invoice.invoiceNumber}`}
      author={invoice.sellerName ?? "Haij"}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.docTitle}>{title}</Text>
          <Text style={styles.wordmark}>{invoice.sellerName}</Text>
        </View>

        <View style={styles.partyRow}>
          <View>
            <Text style={styles.partyLabel}>{isCredit ? "Krediteres til" : "Faktureres til"}</Text>
            <Text style={styles.partyName}>{invoice.buyerName}</Text>
            {invoice.buyerAddress ? <Text style={styles.partyLine}>{invoice.buyerAddress}</Text> : null}
            {invoice.buyerZipcode || invoice.buyerCity ? (
              <Text style={styles.partyLine}>
                {[invoice.buyerZipcode, invoice.buyerCity].filter(Boolean).join(" ")}
              </Text>
            ) : null}
            {invoice.buyerCvr ? <Text style={styles.partyLine}>CVR: {invoice.buyerCvr}</Text> : null}
            {invoice.buyerEanGln ? (
              <Text style={styles.partyLine}>EAN/GLN: {invoice.buyerEanGln}</Text>
            ) : null}
            {invoice.buyerReference ? (
              <Text style={styles.partyLine}>Reference: {invoice.buyerReference}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.partyLabel}>Afsender</Text>
            <Text style={styles.partyName}>{invoice.sellerName}</Text>
            <Text style={styles.partyLine}>{invoice.sellerAddress}</Text>
            <Text style={styles.partyLine}>
              {[invoice.sellerZipcode, invoice.sellerCity].filter(Boolean).join(" ")}
            </Text>
            <Text style={styles.partyLine}>CVR: {invoice.sellerCvr}</Text>
            {invoice.sellerEmail ? <Text style={styles.partyLine}>{invoice.sellerEmail}</Text> : null}
            {invoice.sellerPhone ? <Text style={styles.partyLine}>{invoice.sellerPhone}</Text> : null}
          </View>
        </View>

        <View style={styles.metaBox}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>{isCredit ? "Kreditnotanr." : "Fakturanr."}</Text>
            <Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Dato</Text>
            <Text style={styles.metaValue}>
              {invoice.invoiceDate ? formatDateDa(invoice.invoiceDate) : ""}
            </Text>
          </View>
          {invoice.deliveryDate ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Leveringsdato</Text>
              <Text style={styles.metaValue}>{formatDateDa(invoice.deliveryDate)}</Text>
            </View>
          ) : null}
          {!isCredit && invoice.dueDate ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Forfaldsdato</Text>
              <Text style={styles.metaValue}>{formatDateDa(invoice.dueDate)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={[styles.colDesc, styles.thText]}>Beskrivelse</Text>
            <Text style={[styles.colQty, styles.thText]}>Antal</Text>
            <Text style={[styles.colUnit, styles.thText]}>Enhed</Text>
            <Text style={[styles.colPrice, styles.thText]}>Enhedspris</Text>
            <Text style={[styles.colAmount, styles.thText]}>Beløb ekskl. moms</Text>
          </View>
          {lines.map((line) => (
            <View key={line.id} style={styles.tr} wrap={false}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{formatQuantityHundredths(line.quantityHundredths)}</Text>
              <Text style={styles.colUnit}>{UNIT_LABELS[line.unit] ?? line.unit}</Text>
              <Text style={styles.colPrice}>{money(line.unitPriceOere)}</Text>
              <Text style={styles.colAmount}>{money(line.lineNetOere)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal ekskl. moms</Text>
            <Text>{money(invoice.netOere)}</Text>
          </View>
          {[...vatGroups.entries()].map(([rateBp, group]) => (
            <View key={rateBp} style={styles.totalRow}>
              <Text>
                Moms {formatQuantityHundredths(rateBp)} % af {money(group.baseOere)}
              </Text>
              <Text>{money(group.vatOere)}</Text>
            </View>
          ))}
          <View style={styles.totalGrand}>
            <Text style={styles.bold}>Total {invoice.currency}</Text>
            <Text style={styles.bold}>{money(invoice.grossOere)}</Text>
          </View>
        </View>

        {invoice.note ? <Text style={styles.note}>{invoice.note}</Text> : null}

        <View style={styles.payment}>
          {isCredit ? (
            <Text>Denne kreditnota udligner tidligere faktureret beløb.</Text>
          ) : (
            <>
              <Text>
                Betalingsbetingelser: Netto {invoice.paymentTermsDays}{" "}
                {invoice.paymentTermsDays === 1 ? "dag" : "dage"}
                {invoice.dueDate ? `. Forfald ${formatDateDa(invoice.dueDate)}` : ""}
              </Text>
              {invoice.sellerBankReg && invoice.sellerBankKonto ? (
                <Text>
                  Betaling til reg.nr. {invoice.sellerBankReg}, kontonr. {invoice.sellerBankKonto}.
                  Angiv fakturanr. {invoice.invoiceNumber} ved betaling.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <Text style={styles.footer} fixed>
          {[invoice.sellerName, `CVR ${invoice.sellerCvr}`, invoice.sellerEmail]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: Invoice, lines: Line[]): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf invoice={invoice} lines={lines} />);
}
