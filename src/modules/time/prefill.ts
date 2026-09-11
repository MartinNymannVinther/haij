/**
 * Narrowing a remembered selection down to what the form can still offer.
 *
 * Pure on purpose: the rule that decides whether yesterday's project may
 * be suggested today is the part worth testing, and it has no business
 * touching the database to do it.
 */

export type EntrySelection = {
  companyId: string | null;
  projectId: string | null;
  taskId: string | null;
  roleId: string | null;
};

export const EMPTY_SELECTION: EntrySelection = {
  companyId: null,
  projectId: null,
  taskId: null,
  roleId: null,
};

export type SelectionOptions = {
  companies: Array<{ id: string }>;
  projects: Array<{ id: string }>;
  tasks: Array<{ id: string; projectId: string }>;
  roles: Array<{ id: string }>;
};

/**
 * Keeps only the parts of `selection` that still exist among the options
 * the pickers were built from. A project closed since yesterday, a task
 * that has been completed, a role somebody deleted: each falls back to
 * nothing rather than being offered as a choice that cannot be saved. A
 * task additionally needs its own project to have survived, because the
 * task picker only ever shows tasks belonging to the chosen project.
 */
export function narrowSelection(
  selection: EntrySelection | null,
  options: SelectionOptions,
): EntrySelection {
  if (!selection) return EMPTY_SELECTION;

  const has = (list: Array<{ id: string }>, id: string | null) =>
    id !== null && list.some((item) => item.id === id);

  const projectId = has(options.projects, selection.projectId) ? selection.projectId : null;
  const task = options.tasks.find((item) => item.id === selection.taskId) ?? null;

  return {
    companyId: has(options.companies, selection.companyId) ? selection.companyId : null,
    projectId,
    taskId: task && projectId !== null && task.projectId === projectId ? task.id : null,
    roleId: has(options.roles, selection.roleId) ? selection.roleId : null,
  };
}
