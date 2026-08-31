import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
