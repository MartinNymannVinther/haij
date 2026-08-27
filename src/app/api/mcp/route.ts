import type { NextRequest } from "next/server";
import { resolveApiKey } from "@/modules/mcp/keys";
import { MCP_TOOLS, callTool } from "@/modules/mcp/tools";

export const runtime = "nodejs";

/**
 * Haij's MCP server (phase 5): a stateless Streamable HTTP endpoint
 * implementing the MCP JSON-RPC surface an assistant needs - initialize,
 * ping, tools/list and tools/call. No SSE stream, no sessions: every
 * call carries the API key, every response is a single JSON body. That
 * keeps the endpoint auditable and deliberately small; the official SDK
 * can replace it if the surface ever outgrows this (ADR 0006).
 *
 * Connect with:
 *   claude mcp add --transport http haij https://<host>/api/mcp \
 *     --header "Authorization: Bearer haij_..."
 */

const PROTOCOL_VERSION = "2025-03-26";

// In-process rate limit: 60 calls/min per key.
const windows = new Map<string, number[]>();
function allow(keyId: string): boolean {
  const now = Date.now();
  const recent = (windows.get(keyId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) {
    windows.set(keyId, recent);
    return false;
  }
  recent.push(now);
  windows.set(keyId, recent);
  return true;
}

type JsonRpcRequest = { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = bearer ? await resolveApiKey(bearer) : null;
  if (!key) return rpcError(null, -32001, "unauthorized: missing or invalid API key", 401);
  if (!allow(key.keyId)) return rpcError(null, -32029, "rate limited", 429);

  let payload: JsonRpcRequest;
  try {
    payload = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "parse error", 400);
  }
  if (Array.isArray(payload)) {
    return rpcError(null, -32600, "batch requests are not supported", 400);
  }
  const { id, method, params } = payload;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "haij", version: "0.1.0" },
        instructions:
          "Haij is a Danish business platform. Amounts are integer øre; " +
          "excl./incl. VAT is stated per field. Drafting an invoice never " +
          "issues it - a human does that in the Haij UI.",
      });
    case "notifications/initialized":
      return new Response(null, { status: 202 });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    case "tools/call": {
      const { name, arguments: args } = (params ?? {}) as { name?: string; arguments?: unknown };
      if (!name) return rpcError(id, -32602, "tools/call requires params.name");
      const ctx = { orgId: key.orgId, userId: key.userId };
      const outcome = await callTool(ctx, name, args);
      if (!outcome.ok) {
        return rpcResult(id, {
          content: [{ type: "text", text: outcome.message }],
          isError: true,
        });
      }
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(outcome.result, null, 2) }],
      });
    }
    default:
      return rpcError(id, -32601, `method not found: ${method ?? "?"}`);
  }
}

/** Stateless server: no SSE stream to offer, sessions need no cleanup. */
export function GET() {
  return new Response("Method not allowed", { status: 405 });
}

export function DELETE() {
  return new Response(null, { status: 200 });
}
