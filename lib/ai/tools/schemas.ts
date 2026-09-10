import { z } from "zod";
import { CERTIFIED_FORM_IMPORT_CODES } from "@/lib/ai/forms/import-registry";
import { getMcpBindingInputSchema, getMcpBindingOutputSchema } from "@/lib/ai/mcp/bindings";
import {
  ERP_AI_TOOL_INPUT_SCHEMAS,
  ERP_AI_TOOL_OUTPUT_SCHEMAS,
} from "@/lib/ai/tools/erp-contract";
import {
  FINANCE_AI_TOOL_INPUT_SCHEMAS,
  FINANCE_AI_TOOL_OUTPUT_SCHEMAS,
} from "@/lib/ai/tools/finance-contract";
import {
  MANUFACTURING_AI_TOOL_INPUT_SCHEMAS,
  MANUFACTURING_AI_TOOL_OUTPUT_SCHEMAS,
} from "@/lib/ai/tools/manufacturing-contract";
import {
  TAILORING_AI_TOOL_INPUT_SCHEMAS,
  TAILORING_AI_TOOL_OUTPUT_SCHEMAS,
} from "@/lib/ai/tools/tailoring-contract";

const emptyInput = z.object({}).strict();
const pharmacyResult = z.object({
  toolName: z.string().min(1),
  label: z.string().min(1),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()),
});
const formImportCode = z.enum(CERTIFIED_FORM_IMPORT_CODES as [string, ...string[]]);
const formImportRow = z.record(z.string().min(1), z.unknown()).refine((row) => Object.keys(row).length > 0, "Une ligne d’import ne peut pas être vide.");

export const AI_TOOL_INPUT_SCHEMAS = {
  PHARMACY_DASHBOARD_READ: emptyInput,
  PHARMACY_LOW_STOCK_READ: emptyInput,
  PHARMACY_EXPIRY_READ: emptyInput,
  PHARMACY_OPEN_ALERTS_READ: emptyInput,
  PHARMACY_TODAY_SALES_READ: emptyInput,
  PHARMACY_CASH_SESSIONS_READ: emptyInput,
  PHARMACY_OPEN_PURCHASES_READ: emptyInput,
  PHARMACY_QUALITY_INCIDENTS_READ: emptyInput,
  PHARMACY_DOCUMENTS_SUMMARY_READ: emptyInput,
  ...FINANCE_AI_TOOL_INPUT_SCHEMAS,
  ...ERP_AI_TOOL_INPUT_SCHEMAS,
  ...MANUFACTURING_AI_TOOL_INPUT_SCHEMAS,
  ...TAILORING_AI_TOOL_INPUT_SCHEMAS,
  TASK_DRAFT_PREPARE: z.object({ title: z.string().trim().min(1).max(180), description: z.string().trim().max(4000).optional() }).strict(),
  SUPPORT_TICKET_CREATE: z.object({ subject: z.string().trim().min(3).max(180), message: z.string().trim().min(10).max(8000), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]) }).strict(),
  DTSC_CONTACT_EMAIL_SEND: z.object({ subject: z.string().trim().min(3).max(180), message: z.string().trim().min(10).max(8000) }).strict(),
  ENTERPRISE_FORM_BATCH_IMPORT: z.object({
    formCode: formImportCode,
    rows: z.array(formImportRow).min(1).max(50),
    sourceLabel: z.string().trim().min(1).max(180).optional(),
  }).strict(),
} as const;

export const AI_TOOL_OUTPUT_SCHEMAS = {
  PHARMACY_DASHBOARD_READ: pharmacyResult,
  PHARMACY_LOW_STOCK_READ: pharmacyResult,
  PHARMACY_EXPIRY_READ: pharmacyResult,
  PHARMACY_OPEN_ALERTS_READ: pharmacyResult,
  PHARMACY_TODAY_SALES_READ: pharmacyResult,
  PHARMACY_CASH_SESSIONS_READ: pharmacyResult,
  PHARMACY_OPEN_PURCHASES_READ: pharmacyResult,
  PHARMACY_QUALITY_INCIDENTS_READ: pharmacyResult,
  PHARMACY_DOCUMENTS_SUMMARY_READ: pharmacyResult,
  ...FINANCE_AI_TOOL_OUTPUT_SCHEMAS,
  ...ERP_AI_TOOL_OUTPUT_SCHEMAS,
  ...MANUFACTURING_AI_TOOL_OUTPUT_SCHEMAS,
  ...TAILORING_AI_TOOL_OUTPUT_SCHEMAS,
  TASK_DRAFT_PREPARE: z.object({ title: z.string(), description: z.string().nullable(), status: z.literal("DRAFT") }),
  SUPPORT_TICKET_CREATE: z.object({ ticketId: z.string(), status: z.string() }),
  DTSC_CONTACT_EMAIL_SEND: z.object({ contactMessageId: z.string(), sent: z.boolean() }),
  ENTERPRISE_FORM_BATCH_IMPORT: z.object({
    formCode: formImportCode,
    sourceLabel: z.string().nullable(),
    attempted: z.number().int().min(0).max(50),
    succeeded: z.number().int().min(0).max(50),
    failed: z.number().int().min(0).max(50),
    results: z.array(z.object({ index: z.number().int().min(0), ok: z.boolean(), status: z.number().int(), id: z.string().optional(), message: z.string().optional() })).max(50),
  }),
} as const;

export type AiToolSchemaCode = keyof typeof AI_TOOL_INPUT_SCHEMAS;

export function getAiToolInputSchema(code: string) {
  return AI_TOOL_INPUT_SCHEMAS[code as AiToolSchemaCode] || getMcpBindingInputSchema(code);
}

export function getAiToolOutputSchema(code: string) {
  return AI_TOOL_OUTPUT_SCHEMAS[code as AiToolSchemaCode] || getMcpBindingOutputSchema(code);
}
