import { passkey } from "@better-auth/passkey";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { recordAuthEvent } from "@/core/audit/events";
import { authDb } from "@/core/db/client";
import * as schema from "@/core/db/schema";
import { env } from "@/core/env";

const baseUrl = new URL(env.BETTER_AUTH_URL);

/** First membership of the user, used as the initial active organization. */
async function getDefaultOrganizationId(userId: string): Promise<string | null> {
  const rows = await authDb
    .select({ organizationId: schema.memberships.organizationId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

export const auth = betterAuth({
  appName: "Haij",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema: {
      ...schema,
      // The adapter looks tables up by model name; alias the snake_case
      // model names to the camelCase schema exports.
      two_factors: schema.twoFactors,
      rate_limits: schema.rateLimits,
    },
  }),
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  emailAndPassword: {
    enabled: true,
    // OWASP ASVS: minimum 12 characters. No email provider before phase 2,
    // so verification is intentionally off (recorded in ADR 0001).
    minPasswordLength: 12,
    requireEmailVerification: false,
  },
  rateLimit: {
    // On in every environment, stored in Postgres (no extra infrastructure).
    enabled: true,
    storage: "database",
    modelName: "rate_limits",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/two-factor/verify-totp": { window: 60, max: 10 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await getDefaultOrganizationId(session.userId),
          },
        }),
        after: async (session) => {
          const { activeOrganizationId } = session as { activeOrganizationId?: string | null };
          await recordAuthEvent({
            action: "auth.login",
            actorUserId: session.userId,
            orgId: activeOrganizationId ?? null,
            entityType: "sessions",
            entityId: session.id,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          });
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-out") {
        const session = ctx.context.session;
        await recordAuthEvent({
          action: "auth.logout",
          actorUserId: session?.user.id ?? null,
          orgId: session?.session.activeOrganizationId ?? null,
          entityType: "sessions",
          entityId: session?.session.id ?? null,
        });
      }
    }),
  },
  plugins: [
    organization({
      schema: {
        organization: { modelName: "organizations" },
        member: { modelName: "memberships" },
        invitation: { modelName: "invitations" },
      },
    }),
    passkey({
      rpID: baseUrl.hostname,
      rpName: "Haij",
      origin: env.BETTER_AUTH_URL,
      schema: {
        passkey: { modelName: "passkeys" },
      },
    }),
    twoFactor({
      issuer: "Haij",
      schema: {
        twoFactor: { modelName: "two_factors" },
      },
    }),
    // Must stay last: makes Better Auth set cookies from server actions.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
