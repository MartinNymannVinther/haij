import { count } from "drizzle-orm";
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

export function signupAllowedFor(mode: SignupMode, existingUsers: number): boolean {
  return mode === "open" || existingUsers === 0;
}

export async function countUsers(): Promise<number> {
  const [row] = await authDb.select({ total: count() }).from(users);
  return Number(row?.total ?? 0);
}

export async function signupAllowed(): Promise<boolean> {
  // Skip the count when the answer cannot depend on it.
  if (env.SIGNUP === "open") return true;
  return signupAllowedFor(env.SIGNUP, await countUsers());
}
