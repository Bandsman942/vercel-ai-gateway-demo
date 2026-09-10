import registryData from "@/lib/enterprise/module-registry-data.json";
import commonDomainRegistryData from "@/lib/enterprise/module-registry-common-domains.json";
import financeRegistryData from "@/lib/enterprise/module-registry-finance.json";
import manufacturingRegistryData from "@/lib/enterprise/module-registry-manufacturing.json";
import tailoringRegistryData from "@/lib/enterprise/module-registry-tailoring.json";
import retailRegistryData from "@/lib/enterprise/module-registry-retail.json";
import sectorConvergenceRegistryData from "@/lib/enterprise/module-registry-sector-convergence.json";
import finalCleanupRegistryData from "@/lib/enterprise/module-registry-final-cleanup.json";
import commercialRegistryData from "@/lib/enterprise/module-registry-commercial-overrides.json";
import type { SaasPlanCode } from "@/lib/billing/plans";

export type EnterpriseModuleImplementationStatus =
  | "ACTIVE"
  | "BETA"
  | "PLANNED"
  | "DEPRECATED"
  | "HIDDEN"
  | "RETIRED";

export type EnterpriseModuleDomain =
  | "OPERATIONS"
  | "COMMERCIAL"
  | "PROCUREMENT_INVENTORY"
  | "FINANCE"
  | "HUMAN_RESOURCES"
  | "PROJECTS_ASSETS"
  | "DOCUMENTS"
  | "ANALYTICS"
  | "SECTOR_HEALTH"
  | "SECTOR_PHARMACY"
  | "SECTOR_MANUFACTURING"
  | "INTELLIGENCE"
  | "ADMINISTRATION";

export type EnterpriseModuleNavigationGroup =
  | "OPERATIONS"
  | "PROCUREMENT_RESOURCES"
  | "FINANCE"
  | "INTELLIGENCE"
  | "SECTOR_HEALTH"
  | "SECTOR_PHARMACY"
  | "SECTOR_MANUFACTURING"
  | "ADMINISTRATION"
  | "COMMERCIAL"
  | "HUMAN_RESOURCES"
  | "PROJECTS_ASSETS";

export type EnterpriseModuleRouteKind =
  | "DEDICATED_CORE"
  | "SECTOR_HEALTH"
  | "SECTOR_PHARMACY"
  | "ADMIN_SECTION"
  | "AI_SERVICE"
  | "HIDDEN";

export type EnterpriseModuleAccessPolicy =
  | "MEMBERSHIP"
  | "POSITION_PERMISSION"
  | "ADMIN_ONLY"
  | "EXPLICIT_DENY";

export type EnterpriseModuleDefinition = {
  code: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  domain: EnterpriseModuleDomain;
  implementationStatus: EnterpriseModuleImplementationStatus;
  navigationGroup: EnterpriseModuleNavigationGroup;
  navigationOrder: number;
  iconKey: string;
  routeKind: EnterpriseModuleRouteKind;
  routePath?: string;
  workspaceKey: string | null;
  permissionPrefixes: string[];
  accessPolicy: EnterpriseModuleAccessPolicy;
  minimumPlan: SaasPlanCode;
  requiresActiveSubscription: boolean;
  applicableSectors: string[] | "ALL";
  applicableBusinessSubtypes?: string[] | "ALL";
  dependencies: string[];
  aliases?: string[];
  legacyCodes?: string[];
  qaContract?: string;
};

type EnterpriseModuleCommercialOverride = {
  code: string;
  minimumPlan: SaasPlanCode;
};

export const ENTERPRISE_MODULE_REGISTRY_VERSION = Math.max(
  registryData.version,
  commonDomainRegistryData.version,
  financeRegistryData.version,
  manufacturingRegistryData.version,
  tailoringRegistryData.version,
  retailRegistryData.version,
  sectorConvergenceRegistryData.version,
  finalCleanupRegistryData.version,
  commercialRegistryData.version,
);

const sectorOverrides = new Map(
  sectorConvergenceRegistryData.overrides.map((override) => [override.code, override]),
);
const finalCleanupOverrides = new Map(
  finalCleanupRegistryData.overrides.map((override) => [override.code, override]),
);
const commercialOverrides = new Map<string, EnterpriseModuleCommercialOverride>(
  (commercialRegistryData.overrides as EnterpriseModuleCommercialOverride[]).map((override) => [override.code, override]),
);

function applySectorConvergenceOverride(definition: EnterpriseModuleDefinition): EnterpriseModuleDefinition {
  const override = sectorOverrides.get(definition.code);
  if (!override) return definition;
  return {
    ...definition,
    dependencies: [...new Set(override.dependencies)],
    permissionPrefixes: [...new Set(override.permissionPrefixes)],
  };
}

function applyFinalCleanupOverride(definition: EnterpriseModuleDefinition): EnterpriseModuleDefinition {
  const override = finalCleanupOverrides.get(definition.code);
  if (!override) return definition;
  return {
    ...definition,
    implementationStatus: override.implementationStatus as EnterpriseModuleImplementationStatus,
    routeKind: override.routeKind as EnterpriseModuleRouteKind,
    workspaceKey: override.workspaceKey,
    permissionPrefixes: [...override.permissionPrefixes],
    accessPolicy: override.accessPolicy as EnterpriseModuleAccessPolicy,
    dependencies: [...override.dependencies],
  };
}

function applyCommercialOverride(definition: EnterpriseModuleDefinition): EnterpriseModuleDefinition {
  const override = commercialOverrides.get(definition.code);
  if (!override) return definition;
  return {
    ...definition,
    minimumPlan: override.minimumPlan,
  };
}

export const ENTERPRISE_MODULE_REGISTRY = [
  ...registryData.modules,
  ...commonDomainRegistryData.modules,
  ...financeRegistryData.modules,
  ...manufacturingRegistryData.modules,
  ...tailoringRegistryData.modules,
  ...retailRegistryData.modules,
].map((definition) =>
  applyCommercialOverride(
    applyFinalCleanupOverride(
      applySectorConvergenceOverride(definition as EnterpriseModuleDefinition),
    ),
  ),
);

const definitionByCode = new Map<string, EnterpriseModuleDefinition>();
const canonicalCodeByAlias = new Map<string, string>();

for (const definition of ENTERPRISE_MODULE_REGISTRY) {
  definitionByCode.set(definition.code, definition);
  for (const alias of definition.aliases || []) canonicalCodeByAlias.set(alias, definition.code);
  for (const legacyCode of definition.legacyCodes || []) canonicalCodeByAlias.set(legacyCode, definition.code);
}

export const ENTERPRISE_ADMIN_SECTION_CODES = new Set(
  ENTERPRISE_MODULE_REGISTRY.filter((definition) => definition.routeKind === "ADMIN_SECTION").map((definition) => definition.code),
);

export const ENTERPRISE_IMPLEMENTED_STATUSES = new Set<EnterpriseModuleImplementationStatus>(["ACTIVE", "BETA"]);

export function normalizeEnterpriseModuleCode(moduleCode: string) {
  const normalized = moduleCode.trim().toUpperCase();
  return canonicalCodeByAlias.get(normalized) || normalized;
}

export function getEnterpriseModuleDefinition(moduleCode: string) {
  return definitionByCode.get(normalizeEnterpriseModuleCode(moduleCode)) || null;
}

export function getCanonicalEnterpriseModuleCode(moduleCode: string) {
  return getEnterpriseModuleDefinition(moduleCode)?.code || null;
}

export function isEnterpriseModuleKnown(moduleCode: string) {
  return Boolean(getEnterpriseModuleDefinition(moduleCode));
}

export function isEnterpriseModuleImplemented(moduleCode: string) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  return Boolean(definition && ENTERPRISE_IMPLEMENTED_STATUSES.has(definition.implementationStatus));
}

export function isEnterpriseModuleSectorCompatible(definition: EnterpriseModuleDefinition, sectorCode: string | null | undefined) {
  if (definition.applicableSectors === "ALL") return true;
  return Boolean(sectorCode && definition.applicableSectors.includes(sectorCode));
}

export function isEnterpriseModuleBusinessSubtypeCompatible(
  definition: EnterpriseModuleDefinition,
  businessSubtypeCode: string | null | undefined,
) {
  if (!definition.applicableBusinessSubtypes || definition.applicableBusinessSubtypes === "ALL") return true;
  return Boolean(businessSubtypeCode && definition.applicableBusinessSubtypes.includes(businessSubtypeCode));
}

export function isEnterpriseModuleNavigable(definition: EnterpriseModuleDefinition) {
  return (
    ENTERPRISE_IMPLEMENTED_STATUSES.has(definition.implementationStatus) &&
    definition.routeKind !== "ADMIN_SECTION" &&
    definition.routeKind !== "HIDDEN" &&
    Boolean(definition.routePath && definition.workspaceKey)
  );
}

export function resolveEnterpriseModuleRoute(moduleCode: string) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition || !definition.routePath) return null;
  return {
    canonicalCode: definition.code,
    definition,
    path: definition.routePath,
    redirectedFromAlias: normalizeEnterpriseModuleCode(moduleCode) !== moduleCode.trim().toUpperCase(),
  };
}

export function getEnterpriseAdminLegacyRedirect(moduleCode: string) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  return definition?.routeKind === "ADMIN_SECTION" ? definition.routePath || null : null;
}

export function getEnterpriseModuleAliases() {
  return new Map(canonicalCodeByAlias);
}

export function listEnterpriseModuleDefinitions(options?: {
  statuses?: EnterpriseModuleImplementationStatus[];
  sectorCode?: string | null;
  routeKinds?: EnterpriseModuleRouteKind[];
}) {
  return ENTERPRISE_MODULE_REGISTRY.filter((definition) => {
    if (options?.statuses && !options.statuses.includes(definition.implementationStatus)) return false;
    if (options?.routeKinds && !options.routeKinds.includes(definition.routeKind)) return false;
    if (options && "sectorCode" in options && !isEnterpriseModuleSectorCompatible(definition, options.sectorCode)) return false;
    return true;
  });
}

export function getEnterpriseModuleGroupLabel(group: EnterpriseModuleNavigationGroup, locale?: string | null) {
  const english = locale === "en";
  const labels: Record<EnterpriseModuleNavigationGroup, { fr: string; en: string }> = {
    OPERATIONS: { fr: "Opérations", en: "Operations" },
    PROCUREMENT_RESOURCES: { fr: "Achats & ressources", en: "Procurement & resources" },
    FINANCE: { fr: "Finances", en: "Finance" },
    INTELLIGENCE: { fr: "Intelligence", en: "Intelligence" },
    SECTOR_HEALTH: { fr: "Santé", en: "Health sector" },
    SECTOR_PHARMACY: { fr: "Pharmacie", en: "Pharmacy sector" },
    SECTOR_MANUFACTURING: { fr: "Production", en: "Manufacturing" },
    ADMINISTRATION: { fr: "Administration", en: "Administration" },
    COMMERCIAL: { fr: "Ventes & relation client", en: "Sales & customer relations" },
    HUMAN_RESOURCES: { fr: "Ressources humaines", en: "Human resources" },
    PROJECTS_ASSETS: { fr: "Projets & actifs", en: "Projects & assets" },
  };
  return english ? labels[group].en : labels[group].fr;
}

export function getEnterpriseModuleLabel(definition: EnterpriseModuleDefinition, locale?: string | null) {
  return locale === "en" ? definition.labelEn : definition.labelFr;
}

export function getEnterpriseModuleDescription(definition: EnterpriseModuleDefinition, locale?: string | null) {
  return locale === "en" ? definition.descriptionEn : definition.descriptionFr;
}