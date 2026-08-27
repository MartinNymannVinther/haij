import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/mcp/route";
import { createApiKey, listApiKeys, resolveApiKey, revokeApiKey } from "@/modules/mcp/keys";
import { createCompany } from "@/modules/crm/service";
import { addEntry } from "@/modules/time/service";
import { adminPool } from "../helpers/db";

/**
 * The MCP server end to end through the real route handler: bearer key
 * auth, initialize, tools/list and tools/call - including the structural
 * approval rule (drafts only, never issuing).
 */

const ORG_A = "org_mcp_a";
const ORG_B = "org_mcp_b";
const USER_A = "user_mcp_a";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let plaintext: string;
let companyA: string;

function rpc(body: unknown, key?: string): NextRequest {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'MCP A', 'mcp-a', now()), ($2, 'MCP B', 'mcp-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(`insert into users (id, name, email) values ($1, 'M', 'mcp-a@example.com')`, [
    USER_A,
  ]);
  const key = await createApiKey(CTX_A, "Test key");
  plaintext = key.plaintext;

  companyA = await createCompany(CTX_A, { name: "MCP Kunde ApS" }, "manual");
  await admin.query(
    `insert into org_profiles (org_id, legal_name, cvr, address, zipcode, city, default_hourly_rate_oere)
     values ($1, 'MCP Org', '77777779', 'Vej 1', '8000', 'Aarhus C', 100000)`,
    [ORG_A],
  );
  await addEntry(CTX_A, {
    companyId: companyA,
    entryDate: "2026-08-25",
    durationMinutes: 90,
    note: "MCP-arbejde",
  });
});

afterAll(async () => {
  await admin?.end();
});

describe("api keys", () => {
  it("stores only a hash and resolves the bearer to the creator's context", async () => {
    expect(plaintext).toMatch(/^haij_[0-9a-f]{40}$/);
    const stored = await admin.query(
      `select key_hash, key_prefix from api_keys where org_id = $1`,
      [ORG_A],
    );
    expect(stored.rows[0].key_hash).not.toContain(plaintext);
    expect(plaintext.startsWith(stored.rows[0].key_prefix)).toBe(true);

    const resolved = await resolveApiKey(plaintext);
    expect(resolved).toMatchObject({ orgId: ORG_A, userId: USER_A });
    expect(await resolveApiKey("haij_" + "0".repeat(40))).toBeNull();
    expect(await resolveApiKey("garbage")).toBeNull();
  });

  it("the audit trail never carries the key hash", async () => {
    const leaked = await admin.query(
      `select count(*)::int as n from audit_log
       where entity_type = 'api_keys' and (after_data ? 'key_hash' or before_data ? 'key_hash')`,
    );
    expect(leaked.rows[0].n).toBe(0);
    const audited = await admin.query(
      `select count(*)::int as n from audit_log where org_id = $1 and action = 'api_keys.insert'`,
      [ORG_A],
    );
    expect(audited.rows[0].n).toBe(1);
  });
});

describe("mcp endpoint", () => {
  it("rejects missing or invalid keys", async () => {
    const noKey = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    expect(noKey.status).toBe(401);
    const badKey = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, "haij_" + "f".repeat(40)),
    );
    expect(badKey.status).toBe(401);
  });

  it("initializes and lists tools", async () => {
    const init = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, plaintext));
    expect(init.status).toBe(200);
    const initBody = await init.json();
    expect(initBody.result.protocolVersion).toBe("2025-03-26");
    expect(initBody.result.serverInfo.name).toBe("haij");

    const list = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, plaintext));
    const listBody = await list.json();
    const names = listBody.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("haij_list_companies");
    expect(names).toContain("haij_create_invoice_draft");
    expect(names).not.toContain("haij_issue_invoice"); // drafts only, by design
  });

  it("calls tools scoped to the key's organization", async () => {
    const call = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "haij_list_companies", arguments: {} },
        },
        plaintext,
      ),
    );
    const body = await call.json();
    expect(body.result.isError).toBeUndefined();
    const companies = JSON.parse(body.result.content[0].text);
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("MCP Kunde ApS");
  });

  it("drafts an invoice from unbilled time - and only drafts it", async () => {
    const call = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "haij_create_invoice_draft",
            arguments: { companyId: companyA },
          },
        },
        plaintext,
      ),
    );
    const body = await call.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.status).toBe("draft");
    expect(result.lines).toBe(1);
    expect(result.netOere).toBe(150000); // 1,5 t à 1.000 kr.

    const row = await admin.query(`select status, created_by from invoices where id = $1`, [
      result.invoiceId,
    ]);
    expect(row.rows[0]).toMatchObject({ status: "draft", created_by: USER_A });
  });

  it("reports tool errors without crashing the envelope", async () => {
    const call = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "haij_get_company", arguments: {} },
        },
        plaintext,
      ),
    );
    const body = await call.json();
    expect(body.result.isError).toBe(true);

    const unknown = await POST(
      rpc(
        { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } },
        plaintext,
      ),
    );
    const unknownBody = await unknown.json();
    expect(unknownBody.result.isError).toBe(true);
  });

  it("a revoked key stops working", async () => {
    const keys = await listApiKeys(CTX_A);
    await revokeApiKey(CTX_A, keys[0]!.id);
    const call = await POST(rpc({ jsonrpc: "2.0", id: 7, method: "ping" }, plaintext));
    expect(call.status).toBe(401);
  });
});
