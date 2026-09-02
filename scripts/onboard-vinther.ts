/**
 * One-off onboarding for Vinther Consulting: the signals and knowledge
 * setup, plus one customer's history (hours and issued invoices) carried
 * over from the previous system.
 *
 * Run it from the project root with the app's own environment:
 *
 *     pnpm script scripts/onboard-vinther.ts <org-slug-or-id> <history.json> [--dry-run]
 *
 * The history file is not part of the repository: it is one customer's
 * real hours, rates and invoices, so it lives outside version control.
 * `scripts/data/example.json` shows the shape with made-up values and
 * doubles as a way to try the script on a scratch organization.
 *
 * Idempotent: every step checks for what it would create and skips it,
 * so a second run reports "findes" rather than duplicating anything. It
 * writes through the ordinary service layer, so RLS, the audit log and
 * the invoice immutability rules all apply exactly as they do in the app.
 */

// Loaded before anything touches @/core/env: a standalone script gets no
// help from Next.js, which normally reads .env for us.
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { appPool, authDb, authPool } from "@/core/db/client";
import {
  companies,
  knowledgeSources,
  memberships,
  organizations,
  projects,
  roles,
  timeEntries,
} from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { createCompany, addContact } from "@/modules/crm/service";
import { importHistoricInvoice } from "@/modules/invoicing/import";
import { setNextInvoiceNumber } from "@/modules/invoicing/numbering";
import { createRole, setRoleRate } from "@/modules/invoicing/roles";
import { createProject } from "@/modules/projects/service";
import { addSource } from "@/modules/knowledge/service";
import { saveSignalSettings } from "@/modules/signals/service";
import { addEntry } from "@/modules/time/service";

const dryRun = process.argv.includes("--dry-run");
const [target, historyFile] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

/* ------------------------------ Signaler ----------------------------- */

const SERVICE_PROFILE = `Vinther Consulting er et enmandsrådgivningshus i Hørsholm, etableret 2007, der hjælper større danske organisationer med at tage kunstig intelligens ansvarligt i brug og med at gennemføre digitale transformationer der lander.

Kerneydelser:
- AI-governance og compliance med EU AI Act: risikoklassificering, kvalitetsledelsessystemer efter prEN 18286, og oplæring af interne kontrolfunktioner.
- AI-adoption og digital dannelse: at få medarbejdere til at bruge værktøjerne fornuftigt frem for at forbyde dem.
- Transformationsledelse som Transformation Lead eller programleder på flerårige digitaliseringsprogrammer.
- Agil coaching og porteføljestyring.
- Digital suverænitet: rådgivning om EU-hostede og selvhostede alternativer til amerikanske skytjenester.

Typiske kunder: a-kasser, pensions- og forsikringsselskaber, banker og datacentraler, medicovirksomheder og offentlige myndigheder, typisk fra 200 medarbejdere og opefter. Opgaverne løber fra tre måneder til flere år, faktureres på timebasis mellem 800 og 1.850 kr., og indgås enten direkte med en digitaliserings- eller it-direktør eller som underleverandør gennem et etableret konsulenthus.

Et godt signal: en organisation i de brancher der offentliggør en AI-strategi, opretter en AI-funktion, får en tilsynssag eller et påbud på data- eller AI-området, sætter et større digitaliseringsprogram i gang, eller søger folk til AI-governance, dataetik eller transformationsledelse.

Et dårligt signal: rene it-leverancer, hardware, bemanding, og alt der handler om at sælge en platform frem for at ændre en organisation.`;

const TED_KEYWORDS = [
  "kunstig intelligens",
  "AI-governance",
  "AI-forordningen",
  "digital transformation",
  "digitaliseringsprogram",
  "forandringsledelse",
  "agil transformation",
  "porteføljestyring",
  "dataetik",
].join(", ");

/**
 * Branches where Martin's customers actually sit: banks, insurance and
 * pension, public administration, compulsory social security (which is
 * where the a-kasser are registered), and the trade and professional
 * bodies around them.
 */
const CVR_BRANCHE_PREFIXES = "6419,6512,6530,6619,8411,8412,8413,8430,9411,9412";

/** Buying triggers: policy, supervision and public-sector programmes. */
const SIGNAL_FEEDS = [
  { label: "Altinget: digital", url: "https://www.altinget.dk/digital/rss" },
  { label: "Digitaliseringsstyrelsen", url: "https://digst.dk/nyheder/nyhedsarkiv/?rss=true" },
  { label: "Finanstilsynet", url: "https://www.finanstilsynet.dk/handlers/DynamicRss.ashx" },
  { label: "Version2", url: "https://www.version2.dk/rss" },
];

/** Reading material for the knowledge centre and its digests. */
const KNOWLEDGE_SOURCES = [
  { name: "EU AI Act", url: "https://artificialintelligenceact.eu/feed/" },
  { name: "EU digital strategy", url: "https://digital-strategy.ec.europa.eu/en/rss.xml" },
  { name: "EDPB", url: "https://www.edpb.europa.eu/rss.xml" },
  { name: "Datatilsynet", url: "https://www.datatilsynet.dk/handlers/DynamicRss.ashx" },
  { name: "Mistral AI", url: "https://mistral.ai/news/rss" },
  { name: "Ingeniøren", url: "https://ing.dk/rss.xml" },
  { name: "Computerworld", url: "https://www.computerworld.dk/rss/all" },
];

/* -------------------------------- Data ------------------------------- */

type HistoryData = {
  customer: { name: string; cvr: string; address: string; zipcode: string; city: string };
  contact: { name: string; isPrimary: boolean };
  project: { name: string };
  role: { name: string; hourlyRateOere: number };
  timeEntries: Array<{ date: string; minutes: number; note: string | null }>;
  invoices: Array<{
    ref: string;
    date: string;
    terms: number;
    paidDate: string | null;
    lines: Array<{
      qty: number;
      priceOere: number;
      desc: string;
      vatRateBp: number;
      unit: "hour" | "piece";
      coversMonth: string | null;
    }>;
  }>;
};

/* ------------------------------- Runner ------------------------------ */

const log = (message: string) => console.log(message);
const skip = (message: string) => console.log(`  – ${message} (findes, springer over)`);

async function resolveContext(): Promise<OrgContext> {
  if (!target || !historyFile) {
    throw new Error(
      "Brug: pnpm script scripts/onboard-vinther.ts <org-slug-eller-id> <historik.json> [--dry-run]",
    );
  }
  // The org lookup runs on the auth role: the application role only sees
  // organizations through a user's memberships, and this script has no
  // signed-in user yet.
  const orgs = await authDb
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations);
  const org = orgs.find((o) => o.slug === target || o.id === target);
  if (!org) {
    throw new Error(
      `Fandt ingen organisation "${target}". Kendte: ${orgs.map((o) => o.slug).join(", ") || "ingen"}`,
    );
  }
  const [member] = await authDb
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, org.id), eq(memberships.role, "owner")))
    .limit(1);
  if (!member) throw new Error(`Organisationen ${org.slug} har ingen ejer.`);
  log(`Organisation: ${org.name} (${org.slug})`);
  return { orgId: org.id, userId: member.userId };
}

async function setupSignals(ctx: OrgContext) {
  log("\nSignaler");
  if (dryRun) return log("  – tørløb, skriver ikke");
  await saveSignalSettings(ctx, {
    serviceProfile: SERVICE_PROFILE,
    tedKeywords: TED_KEYWORDS,
    cvrBranchePrefixes: CVR_BRANCHE_PREFIXES,
    rssFeeds: SIGNAL_FEEDS,
  });
  log(
    `  serviceprofil, ${SIGNAL_FEEDS.length} feeds, ${CVR_BRANCHE_PREFIXES.split(",").length} branchekoder`,
  );
}

async function setupKnowledge(ctx: OrgContext) {
  log("\nViden");
  const existing = await withOrgContext(ctx, (tx) =>
    tx.select({ url: knowledgeSources.url }).from(knowledgeSources),
  );
  const have = new Set(existing.map((s) => s.url));
  for (const source of KNOWLEDGE_SOURCES) {
    if (have.has(source.url)) {
      skip(source.name);
      continue;
    }
    if (dryRun) {
      log(`  + ${source.name}`);
      continue;
    }
    await addSource(ctx, source.name, source.url);
    log(`  + ${source.name}`);
  }
}

async function importHistory(ctx: OrgContext) {
  // Resolved against the working directory, so a path outside the
  // repository works as naturally as the example next to this script.
  const file = resolve(historyFile!);
  const data = JSON.parse(readFileSync(file, "utf8")) as HistoryData;
  log(`Historik: ${file}`);

  log("\nKunde, projekt og rolle");

  const [existingCompany] = await withOrgContext(ctx, (tx) =>
    tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.cvr, data.customer.cvr))
      .limit(1),
  );
  let companyId = existingCompany?.id ?? null;
  if (companyId) {
    skip(data.customer.name);
  } else if (!dryRun) {
    companyId = await createCompany(
      ctx,
      { ...data.customer, country: "DK", industryCode: "843000" },
      "manual",
    );
    await addContact(ctx, companyId, data.contact);
    log(`  + ${data.customer.name} med ${data.contact.name}`);
  } else {
    // Dry run on an empty org: nothing exists yet to compare against, so
    // report what the file would create and stop before the writes.
    log(`  + ${data.customer.name} med ${data.contact.name}`);
    log(`  + projekt ${data.project.name}`);
    log(`  + rolle ${data.role.name} til ${data.role.hourlyRateOere / 100} kr./t på kunden`);
    const minutes = data.timeEntries.reduce((sum, e) => sum + e.minutes, 0);
    log(
      `\nTidsregistreringer\n  + ${data.timeEntries.length} poster, ${(minutes / 60).toFixed(1)} timer`,
    );
    log("\nFakturaer");
    for (const invoice of data.invoices) {
      log(
        `  + ${invoice.ref} ${invoice.date}${invoice.paidDate ? ` betalt ${invoice.paidDate}` : ""}`,
      );
    }
    const highest = Math.max(...data.invoices.map((i) => Number(i.ref)));
    log(`\nNæste fakturanummer ville blive: ${highest + 1}`);
    return;
  }

  const [existingProject] = await withOrgContext(ctx, (tx) =>
    tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, data.project.name))
      .limit(1),
  );
  let projectId = existingProject?.id ?? null;
  if (projectId) skip(data.project.name);
  else {
    projectId = await createProject(ctx, { name: data.project.name, companyId: companyId! });
    log(`  + projekt ${data.project.name}`);
  }

  const [existingRole] = await withOrgContext(ctx, (tx) =>
    tx.select({ id: roles.id }).from(roles).where(eq(roles.name, data.role.name)).limit(1),
  );
  let roleId = existingRole?.id ?? null;
  if (roleId) skip(data.role.name);
  else {
    roleId = await createRole(ctx, data.role.name);
    log(`  + rolle ${data.role.name}`);
  }
  await setRoleRate(ctx, { companyId: companyId! }, roleId!, data.role.hourlyRateOere);
  log(`  aftalt timepris ${data.role.hourlyRateOere / 100} kr. på ${data.customer.name}`);

  /* ------------------------------ Tid ------------------------------ */

  log("\nTidsregistreringer");
  const known = await withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: timeEntries.id,
        date: timeEntries.entryDate,
        minutes: timeEntries.durationMinutes,
      })
      .from(timeEntries)
      .where(eq(timeEntries.projectId, projectId!)),
  );
  // Several entries can share a date, so a day is matched by how many
  // entries it already has rather than by identity.
  const perDay = new Map<string, number>();
  for (const entry of known) perDay.set(entry.date, (perDay.get(entry.date) ?? 0) + 1);

  const entriesByMonth = new Map<string, string[]>();
  const seen = new Map<string, number>();
  let created = 0;
  for (const slip of data.timeEntries) {
    const index = seen.get(slip.date) ?? 0;
    seen.set(slip.date, index + 1);
    const month = slip.date.slice(0, 7);
    if (index < (perDay.get(slip.date) ?? 0)) continue; // already imported
    if (dryRun) {
      created += 1;
      continue;
    }
    const id = await addEntry(ctx, {
      entryDate: slip.date,
      durationMinutes: slip.minutes,
      projectId,
      companyId,
      roleId,
      note: slip.note,
    });
    if (id) {
      const list = entriesByMonth.get(month) ?? [];
      list.push(id);
      entriesByMonth.set(month, list);
    }
    created += 1;
  }
  const totalMinutes = data.timeEntries.reduce((sum, s) => sum + s.minutes, 0);
  log(
    `  ${created} nye af ${data.timeEntries.length} (i alt ${(totalMinutes / 60).toFixed(1)} timer)`,
  );

  /* --------------------------- Fakturaer --------------------------- */

  log("\nFakturaer");
  for (const invoice of data.invoices) {
    const number = Number(invoice.ref);
    if (dryRun) {
      log(`  + ${number} ${invoice.date}`);
      continue;
    }
    try {
      await importHistoricInvoice(ctx, {
        companyId: companyId!,
        invoiceNumber: number,
        invoiceDate: invoice.date,
        paymentTermsDays: invoice.terms,
        status: invoice.paidDate ? "paid" : "issued",
        paidDate: invoice.paidDate ?? undefined,
        lines: invoice.lines.map((line) => ({
          description: line.desc,
          quantityHundredths: Math.round(line.qty * 100),
          unit: line.unit,
          unitPriceOere: line.priceOere,
          vatRateBp: line.vatRateBp,
          timeEntryIds: line.coversMonth ? (entriesByMonth.get(line.coversMonth) ?? []) : [],
        })),
      });
      log(`  + ${number} ${invoice.date}${invoice.paidDate ? ` betalt ${invoice.paidDate}` : ""}`);
    } catch (error) {
      if (error instanceof Error && error.message === "NUMBER_TAKEN") {
        skip(`faktura ${number}`);
        continue;
      }
      throw error;
    }
  }

  if (!dryRun) {
    const highest = Math.max(...data.invoices.map((i) => Number(i.ref)));
    await setNextInvoiceNumber(ctx, highest + 1);
    log(`\nNæste fakturanummer: ${highest + 1}`);
  }

  const unbilled = await withOrgContext(ctx, (tx) =>
    tx
      .select({ minutes: timeEntries.durationMinutes })
      .from(timeEntries)
      .where(and(eq(timeEntries.projectId, projectId!), isNull(timeEntries.invoiceLineId))),
  );
  const unbilledMinutes = unbilled.reduce((sum, row) => sum + row.minutes, 0);
  log(`Ufaktureret på projektet: ${(unbilledMinutes / 60).toFixed(1)} timer`);
}

async function main() {
  if (dryRun) log("TØRLØB: intet skrives.\n");
  const ctx = await resolveContext();
  await setupSignals(ctx);
  await setupKnowledge(ctx);
  await importHistory(ctx);
  log("\nFærdig.");
}

main()
  .catch((error) => {
    console.error("\nFejlede:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await appPool.end();
    await authPool.end();
  });
