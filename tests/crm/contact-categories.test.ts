import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  addContact,
  countContactsByCategory,
  createCompany,
  listAllContacts,
  updateContact,
} from "@/modules/crm/service";
import { adminPool } from "../helpers/db";

/**
 * Categories only earn their keep if you can look at contacts across
 * every customer, so the list and the filter are what get tested. The
 * closed vocabulary is enforced by the database, which is checked here
 * too — the point of a fixed set is that nothing else can get in.
 */

const ORG = "org_contact_cat";
const USER = "user_contact_cat";
const CTX = { orgId: ORG, userId: USER };

let admin: Pool;
let akaId: string;
let otherId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at)
       values ($1, 'Kontakter', 'kontakter', now())`,
    [ORG],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'K', 'kontakt@example.com')`, [
    USER,
  ]);
  akaId = await createCompany(CTX, { name: "A-kassen" }, "manual");
  otherId = await createCompany(CTX, { name: "Pensionsselskabet" }, "manual");

  await addContact(CTX, akaId, {
    name: "Kasper",
    title: "Programchef",
    categories: ["decision_maker", "practitioner"],
  });
  await addContact(CTX, akaId, { name: "Thomas", categories: ["practitioner"] });
  await addContact(CTX, otherId, {
    name: "Eva",
    email: "eva@pension.test",
    categories: ["thought_leader"],
  });
  await addContact(CTX, otherId, { name: "Uden kategori" });
});

afterAll(async () => {
  await admin?.end();
});

describe("listAllContacts", () => {
  it("gathers contacts across customers, sorted by name", async () => {
    const rows = await listAllContacts(CTX);
    expect(rows.map((row) => row.name)).toEqual(["Eva", "Kasper", "Thomas", "Uden kategori"]);
    expect(rows.find((row) => row.name === "Eva")?.companyName).toBe("Pensionsselskabet");
  });

  it("filters on a category, including contacts that carry several", async () => {
    const practitioners = await listAllContacts(CTX, undefined, "practitioner");
    expect(practitioners.map((row) => row.name)).toEqual(["Kasper", "Thomas"]);

    const deciders = await listAllContacts(CTX, undefined, "decision_maker");
    expect(deciders.map((row) => row.name)).toEqual(["Kasper"]);
  });

  it("searches name, title, email and customer name", async () => {
    expect((await listAllContacts(CTX, "programchef")).map((r) => r.name)).toEqual(["Kasper"]);
    expect((await listAllContacts(CTX, "eva@pension")).map((r) => r.name)).toEqual(["Eva"]);
    expect((await listAllContacts(CTX, "A-kassen")).map((r) => r.name)).toEqual([
      "Kasper",
      "Thomas",
    ]);
  });

  it("combines search and category", async () => {
    const rows = await listAllContacts(CTX, "A-kassen", "decision_maker");
    expect(rows.map((row) => row.name)).toEqual(["Kasper"]);
  });
});

describe("countContactsByCategory", () => {
  it("counts each category and the whole set", async () => {
    const counts = await countContactsByCategory(CTX);
    expect(counts.all).toBe(4);
    expect(counts.practitioner).toBe(2);
    expect(counts.decision_maker).toBe(1);
    expect(counts.thought_leader).toBe(1);
    expect(counts.press).toBeUndefined();
  });
});

describe("updateContact", () => {
  it("replaces the categories rather than adding to them", async () => {
    const kasper = (await listAllContacts(CTX, "Kasper"))[0]!;
    await updateContact(CTX, kasper.id, {
      name: kasper.name,
      title: kasper.title,
      categories: ["door_opener"],
    });
    const after = (await listAllContacts(CTX, "Kasper"))[0]!;
    expect(after.categories).toEqual(["door_opener"]);
  });
});

describe("the vocabulary stays closed", () => {
  it("the database refuses a category nobody agreed on", async () => {
    await expect(
      admin.query(
        `update contacts set categories = array['influencer'] where org_id = $1 and name = 'Thomas'`,
        [ORG],
      ),
    ).rejects.toThrow(/contacts_categories_valid/);
  });
});
