import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const includesAll = (content, tokens, label) => { for (const token of tokens) check(content.includes(token), `${label}: missing ${token}`); };
const excludesAll = (content, tokens, label) => { for (const token of tokens) check(!content.includes(token), `${label}: forbidden ${token}`); };

const subtypeRegistry = read("lib/enterprise/business-subtype-registry.ts");
const moduleRegistry = read("lib/enterprise/module-registry.ts");
const tailoringRegistry = read("lib/enterprise/module-registry-tailoring.json");
const moduleAccess = read("lib/enterprise/module-access.ts");
const entitlements = read("lib/billing/entitlements.ts");
const schema = read("prisma/enterprise-tailoring.prisma");
const migration = read("prisma/migrations/20260910003000_tailoring_apparel_core/migration.sql");
const provisioning = read("lib/enterprise/tailoring/provisioning.ts");
const templateApplication = read("lib/enterprise/sector-template-application.ts");
const organizationCreate = read("app/api/admin/client-organizations/route.ts");
const shared = read("lib/enterprise/tailoring/shared.ts");
const validators = read("lib/enterprise/tailoring/validators.ts");
const service = read("lib/enterprise/tailoring/service.ts");
const queries = read("lib/enterprise/tailoring/queries.ts");
const api = read("app/api/enterprise/[organizationId]/tailoring/route.ts");
const http = read("lib/enterprise/tailoring/http.ts");
const workspace = read("components/enterprise/tailoring/enterprise-tailoring-workspace.tsx");
const page = read("app/enterprise-tailoring/[moduleCode]/page.tsx");
const copy = read("lib/enterprise/tailoring/i18n.ts");
const options = read("lib/enterprise/tailoring/options.ts");
const aiContract = read("lib/ai/tools/tailoring-contract.ts");
const aiExecutor = read("lib/ai/tools/executors/tailoring.ts");
const aiRegistry = read("lib/ai/tool-registry.ts");
const aiSchemas = read("lib/ai/tools/schemas.ts");
const aiExecutors = read("lib/ai/tools/executors/index.ts");
const aiAgent = read("lib/ai/agent/tools.ts");
const regression = read("scripts/qa-regression-checks.mjs");
const docs = fs.existsSync(path.join(root, "docs/ERP_TAILORING_APPAREL.md")) ? read("docs/ERP_TAILORING_APPAREL.md") : "";

const moduleCodes = [
  "TAILORING_OVERVIEW", "TAILORING_MEASUREMENTS", "TAILORING_STYLES_PATTERNS", "TAILORING_SIZE_GRADING", "TAILORING_MATERIAL_PROFILES",
  "TAILORING_CUTTING_PLANS", "TAILORING_FITTINGS", "TAILORING_ALTERATIONS", "TAILORING_GARMENT_TRACKING", "TAILORING_FINISHING",
];

includesAll(subtypeRegistry, ['sectorCode: "MANUFACTURING"', 'code: "TAILORING_APPAREL"', 'implementationStatus: "ACTIVE"'], "active Manufacturing subtype");
for (const code of moduleCodes) {
  includesAll(tailoringRegistry, [`\"code\": \"${code}\"`, '\"implementationStatus\": \"ACTIVE\"', '\"applicableBusinessSubtypes\": [\"TAILORING_APPAREL\"]', `/enterprise-tailoring/${code}`], `registry ${code}`);
}
includesAll(moduleRegistry, ["module-registry-tailoring.json", "applicableBusinessSubtypes", "isEnterpriseModuleBusinessSubtypeCompatible"], "canonical module registry subtype support");
includesAll(moduleAccess, ["businessSubtypeCode", "BUSINESS_SUBTYPE_INCOMPATIBLE", "isEnterpriseModuleBusinessSubtypeCompatible"], "runtime subtype access gate");
includesAll(entitlements, ["businessSubtypeCode", "BUSINESS_SUBTYPE_INCOMPATIBLE", "isEnterpriseModuleBusinessSubtypeCompatible", "canUseModule", "assertCanUseModule", "getOrganizationUsageLimits"], "commercial entitlement subtype gate without helper regression");

for (const model of [
  "EnterpriseTailoringConfiguration", "EnterpriseTailoringMeasurementProfile", "EnterpriseTailoringMeasurementValue", "EnterpriseTailoringStyle",
  "EnterpriseTailoringSizeGrade", "EnterpriseTailoringSizeGradeRule", "EnterpriseTailoringMaterialProfile", "EnterpriseTailoringCuttingPlan",
  "EnterpriseTailoringFitting", "EnterpriseTailoringAlteration", "EnterpriseTailoringGarmentBundle", "EnterpriseTailoringFinishingRecord",
]) check(schema.includes(`model ${model} {`), `Prisma model missing: ${model}`);
includesAll(schema, ["businessPartyId", "catalogItemId", "bomId", "routingId", "productionOrderId", "materialRequirementId", "qualityCheckId", "employeeId", "workCenterId", "@@unique([organizationId, id])"], "canonical references and tenant-aware keys");
excludesAll(schema, ["TailoringCustomer", "TailoringStock", "TailoringSupplier", "TailoringSale", "TailoringPurchase", "TailoringInvoice", "TailoringPayment", "TailoringEmployee"], "no parallel ERP masters");
check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "Tailoring migration must remain additive");
includesAll(migration, ["EnterpriseTailoringMeasurementProfile", "EnterpriseTailoringCuttingPlan", "EnterpriseTailoringFitting", "EnterpriseTailoringFinishingRecord"], "Tailoring additive migration");

includesAll(provisioning, ["TAILORING_MODULE_CODES", "TAILORING_BUSINESS_SUBTYPE_CODE", "enterpriseTailoringConfiguration", "enterpriseModule.upsert", "enterprisePosition.upsert"], "Couture provisioning");
includesAll(templateApplication, ["syncTailoringOnboardingProvisioning", "TAILORING_BUSINESS_SUBTYPE_CODE"], "sector template Tailoring provisioning");
includesAll(organizationCreate, ["TAILORING_APPAREL", "tailoringForcesSectorTemplate", "applyCanonicalSectorTemplateToOrganization"], "admin creation must force Manufacturing template for Couture");

includesAll(shared, ["assertTailoringOrganization", "getBusinessSubtypeSelection", "TAILORING_BUSINESS_SUBTYPE_CODE", "requireTailoringCustomer", "enterpriseBusinessParty", "requireTailoringCatalogItem", "enterpriseCatalogItem", "requireTailoringProductionOrder", "enterpriseProductionOrder", "requireTailoringQualityCheck", "enterpriseProductionQualityCheck", "Serializable"], "tenant-scoped canonical reference validation");
includesAll(validators, ["TAILORING_MEASUREMENT_CODES", "TAILORING_GARMENT_TYPES", "TAILORING_GRAIN_DIRECTIONS", "TAILORING_ALTERATION_TYPES", "TAILORING_ALTERATION_AREAS", "tailoringFinishingSchema"], "controlled Tailoring validators");
includesAll(service, ["ADJUSTMENTS_REQUIRED", "TAILORING_FITTING_REQUIRES_ADJUSTMENTS", "QUALITY", "PASS", "READY_FOR_DELIVERY", "addEnterpriseOperationalEvent"], "Tailoring workflow invariants and audit");
includesAll(queries, ["organizationId", "take: 1000", "getTailoringOverview", "getTailoringModuleData", "getTailoringReferences"], "bounded tenant-scoped reads");
includesAll(http, ["isSameOriginRequest", "rateLimit", "activeOrganizationId !== organizationId", "resolveEnterpriseModuleAccess"], "Tailoring HTTP security");
includesAll(api, ["authorizeTailoringRequest", "writeAuditLog", "writeApiLog", "CRM_CUSTOMERS", "CATALOG", "INVENTORY_LOGISTICS", "PRODUCTION_ORDERS", "MATERIAL_REQUIREMENTS", "HUMAN_RESOURCES", "QUALITY_CONTROL"], "Tailoring API cross-domain authorization");

includesAll(page, ["EnterpriseTailoringWorkspace", "TAILORING_MODULE_CODES", "resolveEnterpriseModuleCapabilities", 'workspaceKey !== "ENTERPRISE_TAILORING"'], "dedicated Tailoring page access");
includesAll(workspace, ["ModuleWorkspace", "ModuleMetrics", "ProfessionalTabs", "ProfessionalHelp", "CREATE_MEASUREMENT_PROFILE", "CREATE_STYLE", "CREATE_SIZE_GRADE", "CREATE_MATERIAL_PROFILE", "CREATE_CUTTING_PLAN", "COMPLETE_FITTING", "CREATE_ALTERATION", "CREATE_GARMENT_BUNDLE", "UPSERT_FINISHING"], "functional Tailoring workspace");
includesAll(workspace, ["NativeSelect", "tailoringMeasurementCodeChoices", "tailoringGarmentTypeChoices", "tailoringAlterationTypeChoices", "tailoringFinishingStatusChoices"], "controlled reference/form choices");
includesAll(copy, ["fr: {", "en: {", "canonicalHint", "physicalWasteHint", "deliveryHint"], "FR/EN Tailoring copy");
includesAll(options, ["tailoringMeasurementCodeChoices", "tailoringGarmentTypeChoices", "tailoringAlterationAreaChoices", "tailoringGrainDirectionChoices"], "localized enum options");

const aiCodes = [
  "ERP_TAILORING_OVERVIEW_READ", "ERP_TAILORING_MEASUREMENTS_READ", "ERP_TAILORING_STYLES_READ", "ERP_TAILORING_GRADING_READ", "ERP_TAILORING_MATERIALS_READ",
  "ERP_TAILORING_CUTTING_READ", "ERP_TAILORING_FITTINGS_READ", "ERP_TAILORING_ALTERATIONS_READ", "ERP_TAILORING_GARMENTS_READ", "ERP_TAILORING_FINISHING_READ",
];
for (const code of aiCodes) check(aiContract.includes(code), `AI Tailoring contract missing ${code}`);
includesAll(aiContract, ['allowedSectorCodes: ["MANUFACTURING"]', 'requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"]', 'mode: "READ"', 'allowedAssistantCodes: ["ENTERPRISE_GENERAL"]'], "Tailoring AI authorization");
excludesAll(aiContract, ['mode: "MUTATE"', 'mode: "SENSITIVE_MUTATE"'], "Tailoring AI must remain read-only");
includesAll(aiExecutor, ["resolveEnterpriseModuleAccess", "getTailoringModuleData", "getTailoringOverview", "slice(0, limit)", "activeOrganizationId !== organizationId"], "Tailoring AI tenant-safe bounded execution");
includesAll(aiRegistry, ["TAILORING_AI_TOOL_DEFINITIONS", "...TAILORING_AI_TOOL_DEFINITIONS"], "AI registry wiring");
includesAll(aiSchemas, ["TAILORING_AI_TOOL_INPUT_SCHEMAS", "TAILORING_AI_TOOL_OUTPUT_SCHEMAS"], "AI schemas wiring");
includesAll(aiExecutors, ["TAILORING_AI_TOOL_EXECUTORS", "...TAILORING_AI_TOOL_EXECUTORS"], "AI executors wiring");
includesAll(aiAgent, ["TAILORING_AI_TOOL_DESCRIPTIONS", "...TAILORING_AI_TOOL_DESCRIPTIONS"], "AI Agent Tailoring descriptions");

check(regression.includes("qa-607-tailoring-apparel.mjs"), "Tailoring QA must be wired into canonical regression");
includesAll(docs, ["TAILORING_APPAREL", "CRM", "Catalog", "Inventory", "Manufacturing", "sur mesure", "prêt-à-porter", "mixte", "rollback"], "Tailoring architecture documentation");

if (failures.length) {
  console.error(`qa-607-tailoring-apparel: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("qa-607-tailoring-apparel: OK");
