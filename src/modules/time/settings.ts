import { desc, eq } from "drizzle-orm";
import { timeEntries, userTimeSettings } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import type { EntrySelection } from "./prefill";

/**
 * Per-user time-tracking preferences, and the lookup they exist for.
 *
 * Registering time is repetitive work: the same customer, the same
 * project, several times a day. Offering the last entry again removes
 * four choices from the common case. It is a preference and not a rule,
 * because a day spent switching between customers is better served by an
 * empty form.
 */

export type TimeSettings = {
  prefillFromLastEntry: boolean;
};

/** What someone gets before they have ever opened the settings page. */
export const DEFAULT_TIME_SETTINGS: TimeSettings = { prefillFromLastEntry: true };

export async function getTimeSettings(ctx: OrgContext): Promise<TimeSettings> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ prefillFromLastEntry: userTimeSettings.prefillFromLastEntry })
      .from(userTimeSettings)
      .where(eq(userTimeSettings.userId, ctx.userId))
      .limit(1);
    return row ?? DEFAULT_TIME_SETTINGS;
  });
}

export async function saveTimeSettings(ctx: OrgContext, settings: TimeSettings): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    await tx
      .insert(userTimeSettings)
      .values({
        orgId: ctx.orgId,
        userId: ctx.userId,
        prefillFromLastEntry: settings.prefillFromLastEntry,
      })
      .onConflictDoUpdate({
        target: [userTimeSettings.orgId, userTimeSettings.userId],
        set: { prefillFromLastEntry: settings.prefillFromLastEntry, updatedAt: new Date() },
      });
  });
}

/**
 * The customer, project, task and role from this user's most recent
 * entry — the newest row they wrote, not the latest date they wrote it
 * on, because what was registered last is what the next registration is
 * most likely to resemble. Hours belonging to colleagues stay out of it.
 */
export async function lastEntrySelection(ctx: OrgContext): Promise<EntrySelection | null> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({
        companyId: timeEntries.companyId,
        projectId: timeEntries.projectId,
        taskId: timeEntries.taskId,
        roleId: timeEntries.roleId,
      })
      .from(timeEntries)
      .where(eq(timeEntries.userId, ctx.userId))
      .orderBy(desc(timeEntries.createdAt), desc(timeEntries.id))
      .limit(1);
    return row ?? null;
  });
}
