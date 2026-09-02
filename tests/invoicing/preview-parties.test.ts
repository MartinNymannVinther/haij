import { describe, expect, it } from "vitest";
import type { companies, invoices, orgProfiles } from "@/core/db/schema";
import { withPreviewParties } from "@/modules/invoicing/service";

/**
 * A preview whose only job is to show what the customer will receive must
 * not show an invoice with no parties on it. The snapshot still happens
 * at issue; this fills the same values in for display, and must leave an
 * issued invoice completely alone — its addresses are the ones it was
 * sent with, whatever the customer record says today.
 */

type Invoice = typeof invoices.$inferSelect;
type Company = typeof companies.$inferSelect;
type Profile = typeof orgProfiles.$inferSelect;

const company = {
  name: "Eksempel A-kasse",
  cvr: "87654321",
  address: "Eksempelvej 1",
  zipcode: "8000",
  city: "Aarhus C",
  eanGln: "5798765432109",
} as Company;

const profile = {
  legalName: "Vinther Consulting",
  cvr: "30769201",
  address: "Slotsmarken 18",
  zipcode: "2970",
  city: "Hørsholm",
  email: "martin@vintherconsulting.dk",
  phone: null,
  bankReg: "5475",
  bankKonto: "0001585252",
} as Profile;

const draft = {
  status: "draft",
  paymentTermsDays: 14,
  buyerName: null,
  buyerCvr: null,
  buyerAddress: null,
  buyerZipcode: null,
  buyerCity: null,
  buyerEanGln: null,
  sellerName: null,
  sellerCvr: null,
  sellerAddress: null,
  sellerZipcode: null,
  sellerCity: null,
  sellerEmail: null,
  sellerPhone: null,
  sellerBankReg: null,
  sellerBankKonto: null,
  invoiceDate: null,
  deliveryDate: null,
  dueDate: null,
} as Invoice;

describe("withPreviewParties", () => {
  it("fills a draft with the customer and the company profile", () => {
    const preview = withPreviewParties(draft, company, profile);
    expect(preview.buyerName).toBe("Eksempel A-kasse");
    expect(preview.buyerCvr).toBe("87654321");
    expect(preview.buyerCity).toBe("Aarhus C");
    expect(preview.buyerEanGln).toBe("5798765432109");
    expect(preview.sellerName).toBe("Vinther Consulting");
    expect(preview.sellerBankKonto).toBe("0001585252");
  });

  it("shows the dates and payment terms the customer will be given", () => {
    const preview = withPreviewParties(draft, company, profile);
    expect(preview.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(preview.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days =
      (Date.parse(`${preview.dueDate}T00:00:00Z`) -
        Date.parse(`${preview.invoiceDate}T00:00:00Z`)) /
      86_400_000;
    expect(days).toBe(14);
  });

  it("never overwrites something typed on the draft itself", () => {
    const preview = withPreviewParties(
      { ...draft, buyerEanGln: "5791234567890", deliveryDate: "2026-08-01" },
      company,
      profile,
    );
    expect(preview.buyerEanGln).toBe("5791234567890");
    expect(preview.deliveryDate).toBe("2026-08-01");
  });

  it("leaves an issued invoice exactly as it was sent", () => {
    const issued = {
      ...draft,
      status: "issued",
      buyerName: "Gammelt navn ApS",
      buyerAddress: "Gammel vej 1",
      invoiceDate: "2026-01-30",
    } as Invoice;
    expect(withPreviewParties(issued, company, profile)).toBe(issued);
  });

  it("copes with a draft that has no customer or profile yet", () => {
    const preview = withPreviewParties(draft, null, null);
    expect(preview.buyerName).toBeNull();
    expect(preview.sellerName).toBeNull();
    expect(preview.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
