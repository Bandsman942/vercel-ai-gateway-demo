import { listEnabledMcpToolBindings } from "@/lib/ai/mcp/bindings";
import { getMcpToolExecutor } from "@/lib/ai/mcp/tool-adapter";
import { ERP_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/erp";
import { FINANCE_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/finance";
import { FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS } from "@/lib/ai/tools/executors/finance-accounting-query";
import { FORM_IMPORT_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/form-import";
import { MANUFACTURING_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/manufacturing";
import { TAILORING_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/tailoring";
import { PHARMACY_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/pharmacy";
import { PRIVATE_ACTION_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/private-actions";
import { TASK_DRAFT_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/task-drafts";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

const AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  ...PHARMACY_AI_TOOL_EXECUTORS,
  ...FINANCE_AI_TOOL_EXECUTORS,
  ...FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS,
  ...ERP_AI_TOOL_EXECUTORS,
  ...MANUFACTURING_AI_TOOL_EXECUTORS,
  ...TAILORING_AI_TOOL_EXECUTORS,
  ...PRIVATE_ACTION_AI_TOOL_EXECUTORS,
  ...TASK_DRAFT_AI_TOOL_EXECUTORS,
  ...FORM_IMPORT_AI_TOOL_EXECUTORS,
};

export function getAiToolExecutor(code: string) {
  return AI_TOOL_EXECUTORS[code] || getMcpToolExecutor(code);
}

export function listExecutableAiToolCodes() {
  return Array.from(new Set([
    ...Object.keys(AI_TOOL_EXECUTORS),
    ...listEnabledMcpToolBindings().map((binding) => binding.dtscToolCode),
  ])).sort();
}

export function assertAiToolExecutorIntegrity() {
  return Object.entries(AI_TOOL_EXECUTORS)
    .filter(([, executor]) => typeof executor !== "function")
    .map(([code]) => `${code}: executor is not callable`);
}
