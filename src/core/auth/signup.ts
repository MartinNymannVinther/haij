import { count } from "drizzle-orm";
import { invitationAdmits } from "@/core/access/service";
import { authDb } from "@/core/db/client";
import { users } from "@/core/db/schema";
import { env } from "@/core/env";

/**
 * Who may create an account.
 *
 * A Haij on the open internet with open registration is a Haij where a
 * stranger can make themselves an organization inside your installation.
 * So registration is closed unless it is deliberately opened, and the
 * default has to be the safe one: a setting you must remember to change
 * before going live is a setting that will be forgotten.
 *
 * The exception is the empty installation. A fresh checkout with no users
 * at all lets the first person through, because otherwise nobody could
 * ever get in and every new installation would start with a chicken-and-egg
 * problem solved by hand-editing the database. The window closes by itself
 * the moment that first account exists.
 */
export type SignupMode = typeof env.SIGNUP;

/** Request-level header the registration flow uses to present its key. */
export const INVITATION_HEADER = "x-haij-invitation";

export function signupAllowedFor(mode: SignupMode, existingUsers: number): boolean {
  return mode === "open" || existingUsers === 0;
}

export async function countUsers(): Promise<number> {
  const [row] = await authDb.select({ total: count() }).from(users);
  return Number(row?.total ?? 0);
}

export type SignupAttempt = {
  /** Address the account would be created for. */
  email?: string | null;
  /** Invitation key presented with the attempt, if any. */
  invitationToken?: string | null;
};

/**
 * The one door that is opened on purpose: a closed installation still
 * admits an address that holds a valid invitation from the owner (see
 * src/core/access). The key alone is not enough, the address has to be
 * the one it was issued for.
 */
export async function signupAllowed(attempt: SignupAttempt = {}): Promise<boolean> {
  // Skip the count when the answer cannot depend on it.
  if (env.SIGNUP === "open") return true;
  if (signupAllowedFor(env.SIGNUP, await countUsers())) return true;
  if (attempt.invitationToken && attempt.email) {
    return invitationAdmits(attempt.invitationToken, attempt.email);
  }
  return false;
}
