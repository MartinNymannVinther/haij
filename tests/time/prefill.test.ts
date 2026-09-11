import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, narrowSelection } from "@/modules/time/prefill";

/**
 * A suggestion the form cannot save is worse than no suggestion: it puts
 * a name in the picker that disappears the moment you submit. Everything
 * offered has to still exist among the options the pickers were built
 * from.
 */

const OPTIONS = {
  companies: [{ id: "com_1" }, { id: "com_2" }],
  projects: [{ id: "prj_1" }],
  tasks: [{ id: "tsk_1", projectId: "prj_1" }],
  roles: [{ id: "rol_1" }],
};

describe("narrowSelection", () => {
  it("keeps a selection that is still available in full", () => {
    expect(
      narrowSelection(
        { companyId: "com_1", projectId: "prj_1", taskId: "tsk_1", roleId: "rol_1" },
        OPTIONS,
      ),
    ).toEqual({ companyId: "com_1", projectId: "prj_1", taskId: "tsk_1", roleId: "rol_1" });
  });

  it("suggests nothing when there is no last entry", () => {
    expect(narrowSelection(null, OPTIONS)).toEqual(EMPTY_SELECTION);
  });

  it("drops a project that is no longer active, and the task with it", () => {
    expect(
      narrowSelection(
        { companyId: "com_1", projectId: "prj_gone", taskId: "tsk_1", roleId: "rol_1" },
        OPTIONS,
      ),
    ).toEqual({ companyId: "com_1", projectId: null, taskId: null, roleId: "rol_1" });
  });

  it("drops a task that has been closed but keeps its project", () => {
    expect(
      narrowSelection(
        { companyId: null, projectId: "prj_1", taskId: "tsk_done", roleId: null },
        OPTIONS,
      ),
    ).toEqual({ companyId: null, projectId: "prj_1", taskId: null, roleId: null });
  });

  it("drops a task that belongs to another project than the one selected", () => {
    const options = {
      ...OPTIONS,
      projects: [{ id: "prj_1" }, { id: "prj_2" }],
      tasks: [{ id: "tsk_1", projectId: "prj_1" }],
    };
    expect(
      narrowSelection(
        { companyId: null, projectId: "prj_2", taskId: "tsk_1", roleId: null },
        options,
      ),
    ).toEqual({ companyId: null, projectId: "prj_2", taskId: null, roleId: null });
  });

  it("drops a deleted customer and a deleted role on their own", () => {
    expect(
      narrowSelection(
        { companyId: "com_gone", projectId: "prj_1", taskId: null, roleId: "rol_gone" },
        OPTIONS,
      ),
    ).toEqual({ companyId: null, projectId: "prj_1", taskId: null, roleId: null });
  });
});
