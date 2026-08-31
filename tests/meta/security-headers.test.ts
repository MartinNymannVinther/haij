import { describe, expect, it } from "vitest";
import config from "../../next.config";

/**
 * The draft preview shows the invoice PDF in a frame on our own page.
 * That only works because those two endpoints are SAMEORIGIN rather than
 * DENY — and the preview fails silently when it is wrong: a blank frame,
 * no error, nothing in the terminal. It cost an afternoon once.
 *
 * Everything a person can click stays DENY.
 */

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

function matches(rule: Rule, path: string): boolean {
  // Next compiles these with path-to-regexp; this is close enough to tell
  // the negative lookahead apart from a plain match.
  const pattern = rule.source.replace(/:[A-Za-z]+/g, "[^/]+").replace(/\/\(\.\*\)$/, "(?:/.*)?");
  return new RegExp(`^${pattern}$`).test(path);
}

function frameOptionFor(rules: Rule[], path: string): string | undefined {
  let value: string | undefined;
  for (const rule of rules) {
    if (!matches(rule, path)) continue;
    const header = rule.headers.find((h) => h.key === "X-Frame-Options");
    if (header) value = header.value;
  }
  return value;
}

describe("security headers", () => {
  it("lets our own pages frame the invoice PDF and the time report, and nothing else", async () => {
    const rules = (await config.headers!()) as Rule[];

    expect(frameOptionFor(rules, "/api/invoices/inv_123/pdf")).toBe("SAMEORIGIN");
    expect(frameOptionFor(rules, "/api/time-report")).toBe("SAMEORIGIN");

    for (const path of ["/da", "/da/invoices", "/api/auth/session", "/api/mcp"]) {
      expect(frameOptionFor(rules, path), path).toBe("DENY");
    }
  });

  it("keeps the rest of the hardening on every response", async () => {
    const rules = (await config.headers!()) as Rule[];
    const global = rules.find((rule) => rule.source === "/(.*)");
    expect(global?.headers.map((header) => header.key)).toEqual([
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });
});
