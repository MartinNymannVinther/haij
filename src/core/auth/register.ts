import { APIError } from "better-auth";
import { z } from "zod";
import { organizationSlug } from "@/lib/slug";
import { auth } from "./auth";
import { signupAllowed } from "./signup";

export const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(1).max(200),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export type RegisterResult =
  { ok: true } | { ok: false; error: "invalid" | "emailExists" | "closed" | "generic" };

/** Turns the set-cookie headers of an API response into a cookie header. */
function cookieHeaderFrom(responseHeaders: Headers): Headers {
  const cookie = responseHeaders
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return new Headers({ cookie });
}

/**
 * Registration: creates the user, signs them in, creates their organization
 * and makes it the active one. One function so the "signup creates a user
 * and their organization" invariant lives in a single place. Framework-free
 * so the flow is testable outside Next.js.
 */
export async function registerUserWithOrganization(
  requestHeaders: Headers,
  input: unknown,
): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }
  // Checked here as well as in the Better Auth hook, so the form can say
  // something useful instead of showing a generic failure.
  if (!(await signupAllowed())) {
    return { ok: false, error: "closed" };
  }
  const { name, email, password, organizationName } = parsed.data;

  let sessionHeaders: Headers;
  try {
    const { headers: responseHeaders } = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: requestHeaders,
      returnHeaders: true,
    });
    sessionHeaders = cookieHeaderFrom(responseHeaders);
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "USER_ALREADY_EXISTS") {
      return { ok: false, error: "emailExists" };
    }
    console.error("register: sign-up failed", error);
    return { ok: false, error: "generic" };
  }

  try {
    const organization = await auth.api.createOrganization({
      body: { name: organizationName, slug: organizationSlug(organizationName) },
      headers: sessionHeaders,
    });
    if (organization) {
      await auth.api.setActiveOrganization({
        body: { organizationId: organization.id },
        headers: sessionHeaders,
      });
    }
  } catch (error) {
    // The user exists and is signed in; the dashboard falls back to
    // onboarding when no organization is present.
    console.error("register: organization creation failed", error);
  }

  return { ok: true };
}
