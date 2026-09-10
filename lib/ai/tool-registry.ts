import { CERTIFIED_FORM_IMPORT_CODES } from "@/lib/ai/forms/import-registry";
import { assertMcpToolBindingIntegrity, listMcpAiToolDefinitions } from "@/lib/ai/mcp/bindings";
import { assertMcpResourceBindingIntegrity } from "@/lib/ai/mcp/resource-adapter";

export type AiToolMode = "READ" | "PREPARE" | "MUTATE" | "SENSITIVE_MUTATE";

export type AiToolDefinition = {
  code: string;
  labelKey: string;
  descriptionKey: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  contexts: string[];
  allowedSectorCodes?: string[];
  requiredModuleCodes: string[];
  requiredPermissions: string[];
  minimumPlan?: string | null;
  allowedAssistantCodes?: string[];
  mode: AiToolMode;
  requiresConfirmation: boolean;
  idempotent: boolean;
  auditLevel: "STANDARD" | "SENSITIVE";
};

import { ERP_AI_TOOL_DEFINITIONS } from "@/lib/ai/tools/erp-contract";
import { FINANCE_AI_TOOL_DEFINITIONS } from "@/lib/ai/tools/finance-contract";
import { MANUFACTURING_AI_TOOL_DEFINITIONS } from "@/lib/ai/tools/manufacturing-contract";
import { TAILORING_AI_TOOL_DEFINITIONS } from "@/lib/ai/tools/tailoring-contract";

const EMPTY_OBJECT = { type: "object", additionalProperties: false } as const;
const OBJECT_OUTPUT = { type: "object" } as const;
const SESSION_CONTEXTS = new Set(["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"]);

function pharmacyReadTool({ code, label, description, modules }: { code: string; label: string; description: string; modules: string[] }): AiToolDefinition {
  return {
    code,
    labelKey: label,
    descriptionKey: description,
    inputSchema: EMPTY_OBJECT,
    outputSchema: OBJECT_OUTPUT,
    contexts: ["ORGANIZATION"],
    allowedSectorCodes: ["PHARMACY"],
    requiredModuleCodes: modules,
    requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ", "PHARMACY.READ"],
    minimumPlan: "BUSINESS",
    allowedAssistantCodes: ["PHARMACY_ASSISTANT", "ENTERPRISE_GENERAL"],
    mode: "READ",
    requiresConfirmation: false,
    idempotent: false,
    auditLevel: "STANDARD",
  };
}

const STATIC_AI_TOOL_REGISTRY: AiToolDefinition[] = [
  pharmacyReadTool({ code: "PHARMACY_DASHBOARD_READ", label: "ai.tools.pharmacyDashboard.label", description: "ai.tools.pharmacyDashboard.description", modules: ["AI_ASSISTANT"] }),
  pharmacyReadTool({ code: "PHARMACY_LOW_STOCK_READ", label: "ai.tools.pharmacyLowStock.label", description: "ai.tools.pharmacyLowStock.description", modules: ["ALERTS_EXPIRY_LOW_STOCK"] }),
  pharmacyReadTool({ code: "PHARMACY_EXPIRY_READ", label: "ai.tools.pharmacyExpiry.label", description: "ai.tools.pharmacyExpiry.description", modules: ["BATCH_EXPIRY"] }),
  pharmacyReadTool({ code: "PHARMACY_OPEN_ALERTS_READ", label: "ai.tools.pharmacyAlerts.label", description: "ai.tools.pharmacyAlerts.description", modules: ["ALERTS_EXPIRY_LOW_STOCK"] }),
  pharmacyReadTool({ code: "PHARMACY_TODAY_SALES_READ", label: "ai.tools.pharmacySales.label", description: "ai.tools.pharmacySales.description", modules: ["SALES_CASHIER"] }),
  pharmacyReadTool({ code: "PHARMACY_CASH_SESSIONS_READ", label: "ai.tools.pharmacyCash.label", description: "ai.tools.pharmacyCash.description", modules: ["CASH_INVOICES_PAYMENTS"] }),
  pharmacyReadTool({ code: "PHARMACY_OPEN_PURCHASES_READ", label: "ai.tools.pharmacyPurchases.label", description: "ai.tools.pharmacyPurchases.description", modules: ["SUPPLIERS_ORDERS"] }),
  pharmacyReadTool({ code: "PHARMACY_QUALITY_INCIDENTS_READ", label: "ai.tools.pharmacyQuality.label", description: "ai.tools.pharmacyQuality.description", modules: ["QUALITY_INCIDENTS"] }),
  pharmacyReadTool({ code: "PHARMACY_DOCUMENTS_SUMMARY_READ", label: "ai.tools.pharmacyDocuments.label", description: "ai.tools.pharmacyDocuments.description", modules: ["DOCUMENTS"] }),
  ...FINANCE_AI_TOOL_DEFINITIONS,
  ...ERP_AI_TOOL_DEFINITIONS,
  ...MANUFACTURING_AI_TOOL_DEFINITIONS,
  ...TAILORING_AI_TOOL_DEFINITIONS,
  {
    code: "TASK_DRAFT_PREPARE",
    labelKey: "ai.tools.taskDraft.label",
    descriptionKey: "ai.tools.taskDraft.description",
    inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, description: { type: "string" } }, additionalProperties: false },
    outputSchema: OBJECT_OUTPUT,
    contexts: ["ORGANIZATION", "DTSC_INTERNAL"],
    requiredModuleCodes: ["TASKS_OPERATIONS"],
    requiredPermissions: ["TASKS.CREATE"],
    minimumPlan: "BUSINESS",
    mode: "PREPARE",
    requiresConfirmation: false,
    idempotent: true,
    auditLevel: "STANDARD",
  },
  {
    code: "SUPPORT_TICKET_CREATE",
    labelKey: "ai.tools.supportTicketCreate.label",
    descriptionKey: "ai.tools.supportTicketCreate.description",
    inputSchema: { type: "object", required: ["subject", "message", "priority"], properties: { subject: { type: "string" }, message: { type: "string" }, priority: { enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] } }, additionalProperties: false },
    outputSchema: OBJECT_OUTPUT,
    contexts: ["GLOBAL_CLIENT", "COMMUNITY", "ORGANIZATION"],
    requiredModuleCodes: [],
    requiredPermissions: [],
    mode: "MUTATE",
    requiresConfirmation: true,
    idempotent: true,
    auditLevel: "STANDARD",
  },
  {
    code: "DTSC_CONTACT_EMAIL_SEND",
    labelKey: "ai.tools.contactEmailSend.label",
    descriptionKey: "ai.tools.contactEmailSend.description",
    inputSchema: { type: "object", required: ["subject", "message"], properties: { subject: { type: "string" }, message: { type: "string" } }, additionalProperties: false },
    outputSchema: OBJECT_OUTPUT,
    contexts: ["GLOBAL_CLIENT", "COMMUNITY", "ORGANIZATION"],
    requiredModuleCodes: [],
    requiredPermissions: [],
    mode: "MUTATE",
    requiresConfirmation: true,
    idempotent: true,
    auditLevel: "STANDARD",
  },
  {
    code: "ENTERPRISE_FORM_BATCH_IMPORT",
    labelKey: "ai.tools.enterpriseFormBatchImport.label",
    descriptionKey: "ai.tools.enterpriseFormBatchImport.description",
    inputSchema: {
      type: "object",
      required: ["formCode", "rows"],
      properties: {
        formCode: { enum: CERTIFIED_FORM_IMPORT_CODES },
        rows: { type: "array", minItems: 1, maxItems: 50, items: { type: "object" } },
        sourceLabel: { type: "string" },
      },
      additionalProperties: false,
    },
    outputSchema: OBJECT_OUTPUT,
    contexts: ["ORGANIZATION"],
    requiredModuleCodes: [],
    requiredPermissions: ["ENTERPRISE_AI.TOOLS.MUTATE"],
    minimumPlan: "BUSINESS",
    allowedAssistantCodes: ["ENTERPRISE_GENERAL"],
    mode: "MUTATE",
    requiresConfirmation: true,
    idempotent: true,
    auditLevel: "SENSITIVE",
  },
];

export const AI_TOOL_REGISTRY: AiToolDefinition[] = [...STATIC_AI_TOOL_REGISTRY, ...listMcpAiToolDefinitions()];

export function getAiToolDefinition(code: string) {
  return AI_TOOL_REGISTRY.find((tool) => tool.code === code) || null;
}

export function assertAiToolRegistryIntegrity() {
  const failures: string[] = [...assertMcpToolBindingIntegrity(), ...assertMcpResourceBindingIntegrity()];
  const codes = new Set<string>();
  for (const tool of AI_TOOL_REGISTRY) {
    if (codes.has(tool.code)) failures.push(`Duplicate AI tool: ${tool.code}`);
    codes.add(tool.code);
    if (!tool.contexts.length) failures.push(`${tool.code}: at least one session context is required`);
    for (const context of tool.contexts) if (!SESSION_CONTEXTS.has(context)) failures.push(`${tool.code}: unknown session context ${context}`);
    if ((tool.mode === "MUTATE" || tool.mode === "SENSITIVE_MUTATE") && !tool.requiresConfirmation) failures.push(`${tool.code}: mutations require confirmation`);
    if ((tool.mode === "MUTATE" || tool.mode === "SENSITIVE_MUTATE") && !tool.idempotent) failures.push(`${tool.code}: mutations must be idempotent`);
    if (tool.mode === "READ" && tool.requiresConfirmation) failures.push(`${tool.code}: READ tools must not require mutation confirmation`);
    if (tool.mode === "READ" && tool.idempotent) failures.push(`${tool.code}: live READ tools must not reuse historical execution results`);
  }
  return failures;
}
