import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import type { TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";

export const TAILORING_AI_READ_SPECS = [
  { code: "ERP_TAILORING_OVERVIEW_READ", moduleCode: "TAILORING_OVERVIEW", label: "Vue d’ensemble Couture", description: "Lire les indicateurs autorisés de l’atelier Couture.", linkedModules: [] },
  { code: "ERP_TAILORING_MEASUREMENTS_READ", moduleCode: "TAILORING_MEASUREMENTS", label: "Mensurations Couture", description: "Lire les mensurations client historisées autorisées.", linkedModules: ["CRM_CUSTOMERS"] },
  { code: "ERP_TAILORING_STYLES_READ", moduleCode: "TAILORING_STYLES_PATTERNS", label: "Styles et patrons Couture", description: "Lire les styles, patrons et rattachements de production autorisés.", linkedModules: ["CATALOG", "BILL_OF_MATERIALS", "PRODUCTION_ROUTINGS"] },
  { code: "ERP_TAILORING_GRADING_READ", moduleCode: "TAILORING_SIZE_GRADING", label: "Tailles et gradation Couture", description: "Lire les tailles et règles de gradation autorisées.", linkedModules: ["TAILORING_STYLES_PATTERNS"] },
  { code: "ERP_TAILORING_MATERIALS_READ", moduleCode: "TAILORING_MATERIAL_PROFILES", label: "Tissus et fournitures Couture", description: "Lire les profils techniques Couture rattachés aux articles de stock autorisés.", linkedModules: ["CATALOG", "INVENTORY_LOGISTICS"] },
  { code: "ERP_TAILORING_CUTTING_READ", moduleCode: "TAILORING_CUTTING_PLANS", label: "Plans de coupe Couture", description: "Lire les plans de coupe autorisés liés aux ordres de production.", linkedModules: ["PRODUCTION_ORDERS", "MATERIAL_REQUIREMENTS", "CATALOG"] },
  { code: "ERP_TAILORING_FITTINGS_READ", moduleCode: "TAILORING_FITTINGS", label: "Essayages Couture", description: "Lire les essayages autorisés et leurs résultats.", linkedModules: ["PRODUCTION_ORDERS", "TAILORING_MEASUREMENTS"] },
  { code: "ERP_TAILORING_ALTERATIONS_READ", moduleCode: "TAILORING_ALTERATIONS", label: "Retouches Couture", description: "Lire les retouches autorisées issues des essayages.", linkedModules: ["TAILORING_FITTINGS"] },
  { code: "ERP_TAILORING_GARMENTS_READ", moduleCode: "TAILORING_GARMENT_TRACKING", label: "Suivi des vêtements Couture", description: "Lire les lots de vêtements autorisés dans le parcours atelier.", linkedModules: ["PRODUCTION_ORDERS", "TAILORING_CUTTING_PLANS"] },
  { code: "ERP_TAILORING_FINISHING_READ", moduleCode: "TAILORING_FINISHING", label: "Finition Couture", description: "Lire les contrôles de finition et états de préparation autorisés.", linkedModules: ["TAILORING_GARMENT_TRACKING", "QUALITY_CONTROL"] },
] as const satisfies ReadonlyArray<{ code: string; moduleCode: TailoringModuleCode; label: string; description: string; linkedModules: readonly string[] }>;

export type TailoringAiReadToolCode = (typeof TAILORING_AI_READ_SPECS)[number]["code"];

const inputSchema = z.object({ limit: z.number().int().min(1).max(25).optional() }).strict();
const outputSchema = z.object({
  toolName: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["AVAILABLE", "EMPTY"]),
  summary: z.string(),
  asOf: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
const INPUT_JSON_SCHEMA = { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 25 } }, additionalProperties: false } as const;
const OUTPUT_JSON_SCHEMA = { type: "object" } as const;

export const TAILORING_AI_TOOL_INPUT_SCHEMAS = Object.fromEntries(TAILORING_AI_READ_SPECS.map((spec) => [spec.code, inputSchema])) as Record<TailoringAiReadToolCode, typeof inputSchema>;
export const TAILORING_AI_TOOL_OUTPUT_SCHEMAS = Object.fromEntries(TAILORING_AI_READ_SPECS.map((spec) => [spec.code, outputSchema])) as Record<TailoringAiReadToolCode, typeof outputSchema>;
export const TAILORING_AI_TOOL_DESCRIPTIONS = Object.fromEntries(TAILORING_AI_READ_SPECS.map((spec) => [spec.code, spec.description])) as Record<TailoringAiReadToolCode, string>;

export const TAILORING_AI_TOOL_DEFINITIONS: AiToolDefinition[] = TAILORING_AI_READ_SPECS.map((spec) => ({
  code: spec.code,
  labelKey: `ai.tools.tailoring.${spec.moduleCode.toLowerCase()}.label`,
  descriptionKey: spec.description,
  inputSchema: INPUT_JSON_SCHEMA,
  outputSchema: OUTPUT_JSON_SCHEMA,
  contexts: ["ORGANIZATION"],
  allowedSectorCodes: ["MANUFACTURING"],
  requiredModuleCodes: [spec.moduleCode, ...spec.linkedModules],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"],
  minimumPlan: "BUSINESS",
  allowedAssistantCodes: ["ENTERPRISE_GENERAL"],
  mode: "READ",
  requiresConfirmation: false,
  idempotent: false,
  auditLevel: "SENSITIVE",
}));
