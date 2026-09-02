import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { exportToJson, exportToXlsx } from "@/modules/export/format";
import { buildOrgExport } from "@/modules/export/service";
import { EXPORT_TABLES } from "@/modules/export/tables";
import { adminPool } from "../helpers/db";

/**
 * A full export is the single place where a tenancy mistake would not leak
 * a row but the entire business, in one downloadable file. So the first
 * test here is not "does it export" but "can org A's file contain org B's
 * data" — asked against two organizations whose rows are deliberately easy
 * to tell apart.
 *
 * The second thing worth proving is that the export carries no credentials.
 * It exists to be emailed to an accountant, and an accountant should not
 * receive an API key hash by accident.
 */

const ORG_A = "org_export_a";
const ORG_B = "org_export_b";
const USER_A = "user_export_a";
const USER_B = "user_export_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

const SECRET_HASH = "hash-der-aldrig-maa-ud-af-systemet";

let admin: Pool;

beforeAll(async () => {
  admin = adminPool();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Eksport A ApS', 'eksport-a', now()), ($2, 'Eksport B ApS', 'eksport-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'Eksport Ejer A', 'eksport-a@example.com'),
       ($2, 'Eksport Ejer B', 'eksport-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into memberships (id, organization_id, user_id, role, created_at) values
       ('mem_export_a', $1, $3, 'owner', now()),
       ('mem_export_b', $2, $4, 'owner', now())`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
  await admin.query(
    `insert into companies (id, org_id, name, cvr, pipeline_stage) values
       ('comp_export_a', $1, 'KUNDE-KUN-HOS-A', '33333336', 'lead'),
       ('comp_export_b', $2, 'KUNDE-KUN-HOS-B', '44444442', 'lead')`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into api_keys (id, org_id, name, key_hash, key_prefix, created_by, created_at) values
       ('key_export_a', $1, 'Nøgle A', $2, 'haij_aaa', $3, now())`,
    [ORG_A, SECRET_HASH, USER_A],
  );
});

afterAll(async () => {
  await admin?.query("delete from organizations where id = any($1)", [[ORG_A, ORG_B]]);
  await admin?.query("delete from users where id = any($1)", [[USER_A, USER_B]]);
  await admin?.end();
});

describe("the export list", () => {
  it("names tables and sort columns that actually exist", async () => {
    // Three of these were wrong on the first attempt, and each failure
    // surfaced as a query error from deep inside the export rather than as
    // anything readable. Checking the list against the database costs one
    // query and turns that into a named row.
    const wrong: string[] = [];
    for (const spec of EXPORT_TABLES) {
      const columns = await admin.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = $1",
        [spec.table],
      );
      if (columns.rowCount === 0) {
        wrong.push(`${spec.table}: no such table`);
        continue;
      }
      const names = columns.rows.map((row) => row.column_name);
      if (spec.orderBy && !names.includes(spec.orderBy)) {
        wrong.push(`${spec.table}: no column ${spec.orderBy}`);
      }
      for (const column of spec.redact ?? []) {
        if (!names.includes(column)) wrong.push(`${spec.table}: nothing to redact named ${column}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("a full export", () => {
  it("contains this organization and nothing from the other one", async () => {
    const data = await buildOrgExport(CTX_A);
    const everything = JSON.stringify(data);

    expect(everything).toContain("KUNDE-KUN-HOS-A");
    expect(everything).not.toContain("KUNDE-KUN-HOS-B");
    expect(everything).not.toContain(ORG_B);
    expect(everything).not.toContain("eksport-b@example.com");
  });

  it("never carries the key hash, not even inside the audit trail", async () => {
    const data = await buildOrgExport(CTX_A);
    const everything = JSON.stringify(data);

    // The key row is exported, so there is something to redact.
    expect(everything).toContain("Nøgle A");
    // Nowhere: not in the API-nøgler tab, and not in the copy of the row
    // that the audit trigger wrote when the key was created. That second
    // place is the one that is easy to forget.
    expect(everything).not.toContain(SECRET_HASH);

    const audit = data.sections.find((section) => section.sheet === "Revisionsspor");
    expect(JSON.stringify(audit)).toContain("api_keys.insert");
    expect(JSON.stringify(audit)).not.toContain(SECRET_HASH);
  });

  it("gives every table its own section, plus the people", async () => {
    const data = await buildOrgExport(CTX_A);
    const sheets = data.sections.map((section) => section.sheet);

    expect(sheets).toContain("Brugere");
    for (const spec of EXPORT_TABLES) expect(sheets).toContain(spec.sheet);
    expect(new Set(sheets).size).toBe(sheets.length);
  });

  it("names the members of this organization", async () => {
    const data = await buildOrgExport(CTX_A);
    const members = data.sections.find((section) => section.sheet === "Brugere");
    expect(members?.rows.flat()).toContain("eksport-a@example.com");
  });

  it("writes itself into the audit log", async () => {
    await buildOrgExport(CTX_A);
    const events = await admin.query(
      "select actor_user_id from audit_log where org_id = $1 and action = 'org.exported'",
      [ORG_A],
    );
    expect(events.rowCount).toBeGreaterThan(0);
    expect(events.rows[0].actor_user_id).toBe(USER_A);
  });

  it("becomes a workbook and a JSON document from the same rows", async () => {
    const data = await buildOrgExport(CTX_A);

    const workbook = exportToXlsx(data);
    expect(workbook.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(workbook.length).toBeGreaterThan(1000);

    const json = JSON.parse(exportToJson(data)) as {
      organization: { name: string };
      tables: Record<string, Array<Record<string, unknown>>>;
    };
    expect(json.organization.name).toBe("Eksport A ApS");
    expect(json.tables["Kunder"]?.[0]?.name).toBe("KUNDE-KUN-HOS-A");
  });
});
