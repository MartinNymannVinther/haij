import { z } from "zod";
import type { OrgContext } from "@/core/db/tenant";
import { getCompanyDetail, listCompanies } from "@/modules/crm/service";
import { getCustomerEconomy } from "@/modules/invoicing/economy";
import { formatMinutes } from "@/modules/time/duration";
import { formatOere } from "@/modules/invoicing/money";
import {
  createDraftFromTime,
  getInvoiceDetail,
  listInvoices,
  unbilledSummary,
} from "@/modules/invoicing/service";
import { addTask, listProjects } from "@/modules/projects/service";
import { listSignals } from "@/modules/signals/service";
import { addEntry } from "@/modules/time/service";
import { INVOICE_STATUSES, PROJECT_STATUSES, SIGNAL_STATUSES } from "@/core/db/schema";

/**
 * The MCP tool surface (CLAUDE.md phase 5): platform data and a few safe
 * actions for AI assistants. The approval principle is structural -
 * assistants can DRAFT an invoice from unbilled time, but issuing,
 * sending and everything else that leaves the house stays in the UI
 * with a human on the button.
 */

type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodType;
  inputSchema: Record<string, unknown>;
  handler: (ctx: OrgContext, args: unknown) => Promise<unknown>;
};

const Id = z.string().min(1).max(64);
const DateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MCP_TOOLS: ToolDef[] = [
  {
    name: "haij_list_companies",
    description:
      "List the organization's customers (CRM companies) with pipeline stage. Optional text query filters by name or CVR.",
    schema: z.object({ query: z.string().max(200).optional() }),
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Filter by name or CVR" } },
    },
    handler: async (ctx, args) => {
      const { query } = args as { query?: string };
      return listCompanies(ctx, query);
    },
  },
  {
    name: "haij_get_company",
    description:
      "Get one customer in full: master data, contacts, activity timeline, tracked time and economy (rates, frames, invoiced, outstanding, paid - all in øre).",
    schema: z.object({ companyId: Id }),
    inputSchema: {
      type: "object",
      properties: { companyId: { type: "string" } },
      required: ["companyId"],
    },
    handler: async (ctx, args) => {
      const { companyId } = args as { companyId: string };
      const detail = await getCompanyDetail(ctx, companyId);
      if (!detail) return { error: "not_found" };
      const economy = (await getCustomerEconomy(ctx)).find((row) => row.companyId === companyId);
      return { ...detail, economy: economy ?? null };
    },
  },
  {
    name: "haij_list_unbilled_time",
    description:
      "Unbilled tracked time for a customer, optionally bounded by inclusive from/to dates (yyyy-mm-dd). Returns minutes and entry count.",
    schema: z.object({ companyId: Id, from: DateIso.optional(), to: DateIso.optional() }),
    inputSchema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        from: { type: "string", description: "yyyy-mm-dd inclusive" },
        to: { type: "string", description: "yyyy-mm-dd inclusive" },
      },
      required: ["companyId"],
    },
    handler: async (ctx, args) => {
      const input = args as { companyId: string; from?: string; to?: string };
      const summary = await unbilledSummary(ctx, input.companyId, input);
      return { ...summary, formatted: formatMinutes(summary.minutes) };
    },
  },
  {
    name: "haij_create_invoice_draft",
    description:
      "Create an invoice DRAFT from a customer's unbilled time (optionally date-bounded). Each entry is priced by the rate hierarchy. The draft is NOT issued - a human reviews and issues it in Haij. Returns the draft id and totals.",
    schema: z.object({ companyId: Id, from: DateIso.optional(), to: DateIso.optional() }),
    inputSchema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        from: { type: "string", description: "yyyy-mm-dd inclusive" },
        to: { type: "string", description: "yyyy-mm-dd inclusive" },
      },
      required: ["companyId"],
    },
    handler: async (ctx, args) => {
      const input = args as { companyId: string; from?: string; to?: string };
      const invoiceId = await createDraftFromTime(ctx, input.companyId, input);
      const detail = await getInvoiceDetail(ctx, invoiceId);
      return {
        invoiceId,
        status: "draft",
        lines: detail?.lines.length ?? 0,
        netOere: detail?.invoice.netOere,
        grossOere: detail?.invoice.grossOere,
        formattedGross: detail ? formatOere(detail.invoice.grossOere) : null,
        note: "Draft only. Issuing requires a human in the Haij UI.",
      };
    },
  },
  {
    name: "haij_list_invoices",
    description:
      "List invoices with status (draft/issued/sent/paid), numbers and gross amounts in øre.",
    schema: z.object({ status: z.enum(INVOICE_STATUSES).optional() }),
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: [...INVOICE_STATUSES] } },
    },
    handler: async (ctx, args) => {
      const { status } = args as { status?: (typeof INVOICE_STATUSES)[number] };
      return listInvoices(ctx, status);
    },
  },
  {
    name: "haij_list_projects",
    description:
      "List projects with tasks, tracked minutes, consumption value (øre excl. VAT) and agreed frames.",
    schema: z.object({ status: z.enum(PROJECT_STATUSES).optional() }),
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: [...PROJECT_STATUSES] } },
    },
    handler: async (ctx, args) => {
      const { status } = args as { status?: (typeof PROJECT_STATUSES)[number] };
      return listProjects(ctx, status);
    },
  },
  {
    name: "haij_add_task",
    description: "Add a task to a project's checklist, with an optional due date.",
    schema: z.object({
      projectId: Id,
      title: z.string().min(1).max(300),
      dueDate: DateIso.optional(),
    }),
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        dueDate: { type: "string", description: "yyyy-mm-dd" },
      },
      required: ["projectId", "title"],
    },
    handler: async (ctx, args) => {
      const input = args as { projectId: string; title: string; dueDate?: string };
      const taskId = await addTask(ctx, input.projectId, {
        title: input.title,
        dueDate: input.dueDate ?? null,
      });
      return { taskId };
    },
  },
  {
    name: "haij_log_time",
    description:
      "Log tracked time (1-1440 minutes) on a date, optionally linked to a customer, project and task. The entry belongs to the user who owns the API key.",
    schema: z.object({
      date: DateIso,
      durationMinutes: z.number().int().min(1).max(1440),
      companyId: Id.optional(),
      projectId: Id.optional(),
      taskId: Id.optional(),
      note: z.string().max(1000).optional(),
    }),
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "yyyy-mm-dd" },
        durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
        companyId: { type: "string" },
        projectId: { type: "string" },
        taskId: { type: "string" },
        note: { type: "string" },
      },
      required: ["date", "durationMinutes"],
    },
    handler: async (ctx, args) => {
      const input = args as {
        date: string;
        durationMinutes: number;
        companyId?: string;
        projectId?: string;
        taskId?: string;
        note?: string;
      };
      const entryId = await addEntry(ctx, {
        entryDate: input.date,
        durationMinutes: input.durationMinutes,
        companyId: input.companyId ?? null,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        note: input.note ?? null,
      });
      return { entryId };
    },
  },
  {
    name: "haij_list_signals",
    description:
      "List signals (external opportunities: CVR events, tenders, feeds, manual) with AI scores, reasons and follow-up dates.",
    schema: z.object({ status: z.enum(SIGNAL_STATUSES).optional() }),
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: [...SIGNAL_STATUSES] } },
    },
    handler: async (ctx, args) => {
      const { status } = args as { status?: (typeof SIGNAL_STATUSES)[number] };
      return listSignals(ctx, status ?? "new");
    },
  },
];

export async function callTool(
  ctx: OrgContext,
  name: string,
  args: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; message: string }> {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, message: `unknown tool: ${name}` };
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    return { ok: false, message: `invalid arguments: ${parsed.error.issues[0]?.message ?? ""}` };
  }
  try {
    const result = await tool.handler(ctx, parsed.data);
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tool failed";
    // Domain error codes (COMPANY_NOT_FOUND etc.) are safe to surface.
    return { ok: false, message };
  }
}
