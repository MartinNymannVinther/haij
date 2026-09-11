import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createCompany } from "@/modules/crm/service";
import { addEntry } from "@/modules/time/service";
import {
  DEFAULT_TIME_SETTINGS,
  getTimeSettings,
  lastEntrySelection,
  saveTimeSettings,
} from "@/modules/time/settings";
import { adminPool } from "../helpers/db";

/**
 * The preference is personal: two people in the same organization keep
 * their own answer, and the entry that is offered again is the one they
 * wrote themselves.
 */

const ORG = "org_time_settings";
const USER = "user_time_settings";
const COLLEAGUE = "user_time_settings_2";
const CTX = { orgId: ORG, userId: USER };
const COLLEAGUE_CTX = { orgId: ORG, userId: COLLEAGUE };

let admin: Pool;
let companyId: string;
let otherCompanyId: string;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at)
       values ($1, 'Time Settings', 'time-settings', now())`,
    [ORG],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'T', 'time-s@example.com'), ($2, 'K', 'time-s2@example.com')`,
    [USER, COLLEAGUE],
  );
  companyId = await createCompany(CTX, { name: "Første kunde ApS" }, "manual");
  otherCompanyId = await createCompany(CTX, { name: "Anden kunde ApS" }, "manual");
});

afterAll(async () => {
  await admin?.end();
});

describe("getTimeSettings", () => {
  it("suggests the last entry until someone says otherwise", async () => {
    expect(await getTimeSettings(CTX)).toEqual(DEFAULT_TIME_SETTINGS);
    expect(DEFAULT_TIME_SETTINGS.prefillFromLastEntry).toBe(true);
  });

  it("keeps one person's choice to themselves", async () => {
    await saveTimeSettings(CTX, { prefillFromLastEntry: false });

    expect(await getTimeSettings(CTX)).toEqual({ prefillFromLastEntry: false });
    expect(await getTimeSettings(COLLEAGUE_CTX)).toEqual({ prefillFromLastEntry: true });
  });

  it("can be turned back on without leaving a second row behind", async () => {
    await saveTimeSettings(CTX, { prefillFromLastEntry: true });
    expect(await getTimeSettings(CTX)).toEqual({ prefillFromLastEntry: true });

    const rows = await admin.query(
      `select count(*)::int as count from user_time_settings
       where org_id = $1 and user_id = $2`,
      [ORG, USER],
    );
    expect(rows.rows[0].count).toBe(1);
  });
});

describe("lastEntrySelection", () => {
  it("is empty for someone who has registered nothing", async () => {
    expect(await lastEntrySelection(COLLEAGUE_CTX)).toBeNull();
  });

  it("returns the most recently written entry, not the latest date", async () => {
    await addEntry(CTX, { entryDate: "2026-04-10", durationMinutes: 60, companyId });
    await addEntry(CTX, {
      entryDate: "2026-04-01",
      durationMinutes: 60,
      companyId: otherCompanyId,
    });

    expect(await lastEntrySelection(CTX)).toEqual({
      companyId: otherCompanyId,
      projectId: null,
      taskId: null,
      roleId: null,
    });
  });

  it("never offers a colleague's entry", async () => {
    await addEntry(COLLEAGUE_CTX, { entryDate: "2026-04-12", durationMinutes: 30, companyId });

    const mine = await lastEntrySelection(CTX);
    expect(mine?.companyId).toBe(otherCompanyId);
  });
});
