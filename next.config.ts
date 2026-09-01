import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/**
 * The build stamp. Resolved once when this config is evaluated - at
 * `next build` for a deployed image, at dev-server start locally - and
 * inlined into the bundle through `env`, so a running Haij can state
 * exactly which code it is without reading anything at runtime.
 *
 * The container build has no `.git` (.dockerignore excludes it), so the
 * build passes HAIJ_COMMIT and HAIJ_BUILT_AT in as build arguments; git is
 * only the local fallback. Everything is a string: `env` inlines literals.
 */
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{ tag: string }>;
};

const passedCommit = process.env.HAIJ_COMMIT?.trim() ?? "";
const commit = passedCommit || git("rev-parse", "--short=7", "HEAD") || "unknown";
// Only meaningful when we read the working tree ourselves; a commit handed
// to us by the build has no working tree to be dirty. Tracked files only
// (-uno): an untracked patch file or scratch note lying in the repo is not
// code that runs, and warning about it trains you to ignore the warning.
const dirty = !passedCommit && git("status", "--porcelain", "-uno") !== "" ? "1" : "";
const builtAt = process.env.HAIJ_BUILT_AT?.trim() || new Date().toISOString();
const migration = journal.entries.at(-1)?.tag ?? "unknown";

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  env: {
    HAIJ_VERSION: pkg.version,
    HAIJ_COMMIT: commit,
    HAIJ_DIRTY: dirty,
    HAIJ_BUILT_AT: builtAt,
    HAIJ_MIGRATION: migration,
    HAIJ_MIGRATION_COUNT: String(journal.entries.length),
  },
  async headers() {
    return [
      { source: "/(.*)", headers: baseHeaders },
      {
        // Everything a person can click refuses framing outright:
        // clickjacking protection stays at its strictest.
        source: "/((?!api/invoices/[^/]+/pdf$|api/time-report$).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // The two documents Haij renders for reading inside its own pages:
        // the invoice PDF, which the draft editor frames, and the time
        // report. Framed by this origin only, never by anyone else.
        source: "/api/invoices/:invoiceId/pdf",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/api/time-report",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
