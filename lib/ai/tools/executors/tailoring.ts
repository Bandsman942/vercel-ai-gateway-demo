import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import { TAILORING_AI_READ_SPECS, TAILORING_AI_TOOL_INPUT_SCHEMAS, type TailoringAiReadToolCode } from "@/lib/ai/tools/tailoring-contract";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getTailoringModuleData, getTailoringOverview } from "@/lib/enterprise/tailoring/queries";
import type { TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";

type TailoringArgs = { limit?: number };
type TailoringResult = { toolName: TailoringAiReadToolCode; label: string; status: "AVAILABLE" | "EMPTY"; summary: string; asOf: string; data: Record<string, unknown> };

const LABELS = Object.fromEntries(TAILORING_AI_READ_SPECS.map((spec) => [spec.code, spec.label])) as Record<TailoringAiReadToolCode, string>;
const MODULE_BY_TOOL = Object.fromEntries(TAILORING_AI_READ_SPECS.map((spec) => [spec.code, spec.moduleCode])) as Record<TailoringAiReadToolCode, TailoringModuleCode>;
const DATA_KEY_BY_MODULE: Partial<Record<TailoringModuleCode, string>> = {
  TAILORING_MEASUREMENTS: "measurementProfiles",
  TAILORING_STYLES_PATTERNS: "styles",
  TAILORING_SIZE_GRADING: "styles",
  TAILORING_MATERIAL_PROFILES: "materialProfiles",
  TAILORING_CUTTING_PLANS: "cuttingPlans",
  TAILORING_FITTINGS: "fittings",
  TAILORING_ALTERATIONS: "alterations",
  TAILORING_GARMENT_TRACKING: "garmentBundles",
  TAILORING_FINISHING: "finishingRecords",
};

function requireOrganization(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  return organizationId;
}

function record(value: unknown): Record<string, unknown> {
  const serialized = serializeFinanceValue(value);
  return serialized && typeof serialized === "object" && !Array.isArray(serialized) ? serialized as Record<string, unknown> : { value: serialized };
}

function output(toolName: TailoringAiReadToolCode, count: number, summary: string, data: unknown): TailoringResult {
  return { toolName, label: LABELS[toolName], status: count > 0 ? "AVAILABLE" : "EMPTY", summary, asOf: new Date().toISOString(), data: record(data) };
}

async function run(toolName: TailoringAiReadToolCode, context: AiToolRuntimeContext, args: TailoringArgs) {
  const organizationId = requireOrganization(context);
  const moduleCode = MODULE_BY_TOOL[toolName];
  const access = await resolveEnterpriseModuleAccess({ userId: context.userId, organizationId, moduleCode, action: "read" });
  if (!access.allowed) throw new Error(`${moduleCode}_ACCESS_DENIED`);
  const limit = Math.min(25, Math.max(1, args.limit || 12));

  if (moduleCode === "TAILORING_OVERVIEW") {
    const overview = await getTailoringOverview(organizationId);
    const count = overview.measurementProfiles + overview.activeStyles + overview.scheduledFittings + overview.openAlterations;
    return output(toolName, count, `${overview.activeStyles} style(s) actif(s), ${overview.scheduledFittings} essayage(s) planifié(s), ${overview.openAlterations} retouche(s) ouverte(s).`, overview);
  }

  const moduleData = await getTailoringModuleData(organizationId, moduleCode);
  const dataKey = DATA_KEY_BY_MODULE[moduleCode];
  const source = dataKey ? (moduleData as Record<string, unknown>)[dataKey] : null;
  const items = Array.isArray(source) ? source.slice(0, limit) : [];
  return output(toolName, items.length, `${items.length} élément(s) Couture autorisé(s) lu(s) pour ${LABELS[toolName]}.`, { items, limit });
}

function executor(toolName: TailoringAiReadToolCode): AiToolExecutor {
  return async ({ args, context }) => {
    const parsed = TAILORING_AI_TOOL_INPUT_SCHEMAS[toolName].parse(args || {});
    return run(toolName, context, parsed);
  };
}

export const TAILORING_AI_TOOL_EXECUTORS = Object.fromEntries(TAILORING_AI_READ_SPECS.map((spec) => [spec.code, executor(spec.code)])) as Record<TailoringAiReadToolCode, AiToolExecutor>;
