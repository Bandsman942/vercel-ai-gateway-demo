import { resolveOrganizationCommercialContext, type CommercialOfferSnapshot } from "@/lib/billing/commercial-context";
import { FEATURE_ENTITLEMENTS, moduleRequiresActiveSubscription, type SaasFeatureCode } from "@/lib/billing/module-entitlements";
import { getPlanUsageLimits, type OrganizationUsageLimits } from "@/lib/billing/plan-limits";
import { normalizePlanRequirement, planMeetsRequirement, SAAS_PLANS, type SaasPlanCode } from "@/lib/billing/plans";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleBusinessSubtypeCompatible,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleSectorCompatible,
  normalizeEnterpriseModuleCode,
} from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export type EntitlementDecision = {
  allowed: boolean;
  code:
    | "OK"
    | "ORGANIZATION_INACTIVE"
    | "SUBSCRIPTION_REQUIRED"
    | "PLAN_REQUIRED"
    | "MODULE_DISABLED"
    | "MODULE_NOT_FOUND"
    | "MODULE_NOT_IMPLEMENTED"
    | "SECTOR_INCOMPATIBLE"
    | "BUSINESS_SUBTYPE_INCOMPATIBLE"
    | "ADMIN_SECTION_ONLY";
  message: string;
  requiredPlan?: SaasPlanCode;
};

export type OrganizationEntitlements = {
  organizationId: string;
  organizationStatus: string;
  organizationType: string;
  sectorCode: string | null;
  isDtscInternal: boolean;
  offerId: string | null;
  offerName: string | null;
  offerSlug: string | null;
  commercialSource: "DTSC_INTERNAL" | "ORGANIZATION_SUBSCRIPTION" | "ORGANIZATION_LEGACY_MAPPED" | "ORGANIZATION_BASELINE";
  planCode: SaasPlanCode;
  planLabel: string;
  capabilityLabel: string;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  subscriptionId: string | null;
  trialEndsAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
  limits: OrganizationUsageLimits;
  modules: Array<{
    id: string;
    moduleCode: string;
    canonicalCode: string | null;
    implementationStatus: string | null;
    isEnabled: boolean;
    isCore: boolean;
    requiredPlan: SaasPlanCode;
    includedInPlan: boolean;
    allowed: boolean;
    code: EntitlementDecision["code"];
    message: string;
  }>;
};

export class SaasEntitlementError extends Error {
  status: number;
  code: EntitlementDecision["code"];

  constructor(decision: EntitlementDecision) {
    super(decision.message);
    this.name = "SaasEntitlementError";
    this.status = decision.code === "SUBSCRIPTION_REQUIRED" || decision.code === "PLAN_REQUIRED" ? 402 : 403;
    this.code = decision.code;
  }
}

function activeSubscriptionStatus(status?: string | null) {
  return status === "ACTIVE" || status === "TRIAL";
}

function subscriptionDateValid(subscription?: { expiresAt?: Date | null; trialEndsAt?: Date | null; status?: string | null } | null, now = new Date()) {
  if (!subscription || !activeSubscriptionStatus(subscription.status)) return false;
  if (subscription.status === "TRIAL" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() < now.getTime()) return false;
  return !subscription.expiresAt || subscription.expiresAt.getTime() >= now.getTime();
}

function inactiveOrganizationMessage(status: string) {
  return status === "SUSPENDED"
    ? "Votre espace est suspendu. Le support reste disponible pour régulariser l'accès."
    : "Votre espace n'est pas actif. Contactez DTSC pour finaliser l'activation.";
}

function subscriptionRequiredMessage(label: string) {
  return `${label} nécessite un abonnement actif. Vérifiez votre statut dans votre espace ou contactez le support DTSC.`;
}

function planRequiredMessage(label: string, requiredPlan: SaasPlanCode) {
  return `${label} nécessite le niveau ${SAAS_PLANS[requiredPlan].label} ou supérieur.`;
}

export function isSubscriptionActive(subscription?: { status?: string | null; expiresAt?: Date | string | null; trialEndsAt?: Date | string | null } | null) {
  if (!subscription || !activeSubscriptionStatus(subscription.status)) return false;
  const expiresAt = typeof subscription.expiresAt === "string" ? new Date(subscription.expiresAt) : subscription.expiresAt;
  const trialEndsAt = typeof subscription.trialEndsAt === "string" ? new Date(subscription.trialEndsAt) : subscription.trialEndsAt;
  return subscriptionDateValid({ status: subscription.status, expiresAt, trialEndsAt });
}

function registryDecision({
  moduleCode,
  sectorCode,
  businessSubtypeCode,
  fallbackRequiredPlan,
}: {
  moduleCode: string;
  sectorCode: string | null;
  businessSubtypeCode: string | null;
  fallbackRequiredPlan?: SaasPlanCode | null;
}): {
  canonicalCode: string | null;
  implementationStatus: string | null;
  requiredPlan: SaasPlanCode;
  denial: EntitlementDecision | null;
} {
  const canonicalCode = normalizeEnterpriseModuleCode(moduleCode);
  const definition = getEnterpriseModuleDefinition(canonicalCode);
  const requiredPlan = definition?.minimumPlan || fallbackRequiredPlan || "BUSINESS";
  if (!definition) {
    return {
      canonicalCode: null,
      implementationStatus: null,
      requiredPlan,
      denial: { allowed: false, code: "MODULE_NOT_FOUND", message: "Ce code module est absent du registre canonique.", requiredPlan },
    };
  }
  if (!isEnterpriseModuleImplemented(definition.code) || definition.routeKind === "HIDDEN") {
    return {
      canonicalCode: definition.code,
      implementationStatus: definition.implementationStatus,
      requiredPlan,
      denial: { allowed: false, code: "MODULE_NOT_IMPLEMENTED", message: "Ce module n'est pas encore disponible dans DTSC Platform.", requiredPlan },
    };
  }
  if (definition.routeKind === "ADMIN_SECTION") {
    return {
      canonicalCode: definition.code,
      implementationStatus: definition.implementationStatus,
      requiredPlan,
      denial: { allowed: false, code: "ADMIN_SECTION_ONLY", message: "Cette fonction est une section de l'administration entreprise, pas un module ERP autonome.", requiredPlan },
    };
  }
  if (!isEnterpriseModuleSectorCompatible(definition, sectorCode)) {
    return {
      canonicalCode: definition.code,
      implementationStatus: definition.implementationStatus,
      requiredPlan,
      denial: { allowed: false, code: "SECTOR_INCOMPATIBLE", message: "Ce module n'est pas compatible avec le secteur de l'entreprise active.", requiredPlan },
    };
  }
  if (!isEnterpriseModuleBusinessSubtypeCompatible(definition, businessSubtypeCode)) {
    return {
      canonicalCode: definition.code,
      implementationStatus: definition.implementationStatus,
      requiredPlan,
      denial: { allowed: false, code: "BUSINESS_SUBTYPE_INCOMPATIBLE", message: "Ce module n'est pas compatible avec le sous-secteur de l'entreprise active.", requiredPlan },
    };
  }
  return {
    canonicalCode: definition.code,
    implementationStatus: definition.implementationStatus,
    requiredPlan,
    denial: null,
  };
}

function resolveOrganizationUsageLimits(planCode: SaasPlanCode, offer?: CommercialOfferSnapshot | null): OrganizationUsageLimits {
  const defaults = getPlanUsageLimits(planCode);
  if (!offer) return defaults;
  const dailyMessages = Math.max(1, offer.dailyMessageLimit || Math.ceil(defaults.maxEnterpriseAiMonthlyMessages / 30));
  const dailyTokens = Math.max(1, offer.dailyTokenLimit || defaults.maxEnterpriseAiMonthlyTokens / 30);
  const knowledgeSources = Math.max(0, offer.maxDocuments ?? defaults.maxEnterpriseAiKnowledgeSources);
  return {
    ...defaults,
    maxEnterpriseAiMonthlyMessages: dailyMessages * 30,
    maxEnterpriseAiMonthlyTokens: dailyTokens * 30,
    maxEnterpriseAiKnowledgeSources: knowledgeSources,
  };
}

export async function getOrganizationEntitlements(organizationId: string | null | undefined): Promise<OrganizationEntitlements | null> {
  const commercialContext = await resolveOrganizationCommercialContext(organizationId);
  if (!commercialContext || !commercialContext.organizationId || !commercialContext.organizationStatus || !commercialContext.organizationType) return null;

  if (commercialContext.scope === "DTSC_INTERNAL") {
    return {
      organizationId: commercialContext.organizationId,
      organizationStatus: commercialContext.organizationStatus,
      organizationType: commercialContext.organizationType,
      sectorCode: commercialContext.sectorCode,
      isDtscInternal: true,
      offerId: null,
      offerName: "DTSC Internal",
      offerSlug: null,
      commercialSource: "DTSC_INTERNAL",
      planCode: commercialContext.capabilityCode,
      planLabel: commercialContext.capabilityLabel,
      capabilityLabel: commercialContext.capabilityLabel,
      subscriptionStatus: commercialContext.subscriptionStatus,
      subscriptionActive: true,
      subscriptionId: null,
      trialEndsAt: null,
      startedAt: null,
      expiresAt: null,
      dailyMessageLimit: 0,
      dailyTokenLimit: 0,
      maxDocuments: getPlanUsageLimits("ENTERPRISE").maxDocuments,
      limits: getPlanUsageLimits("ENTERPRISE"),
      modules: [],
    };
  }

  const [organization, subtypeSelection] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: commercialContext.organizationId, deletedAt: null, organizationType: "CLIENT" },
      select: {
        id: true,
        status: true,
        organizationType: true,
        sectorCode: true,
        enterpriseModules: {
          select: { id: true, moduleCode: true, isEnabled: true, isCore: true, requiresPlanLevel: true },
        },
      },
    }),
    prisma.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId: commercialContext.organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    }),
  ]);
  if (!organization) return null;
  const businessSubtypeCode = subtypeSelection?.sectorCode === organization.sectorCode
    ? subtypeSelection.businessSubtypeCode
    : null;

  const planCode = commercialContext.capabilityCode;
  const subscriptionActive = commercialContext.subscriptionActive;
  const limits = resolveOrganizationUsageLimits(planCode, commercialContext.offer);
  const modules = organization.enterpriseModules.map((enterpriseModule) => {
    const configuredPlan = normalizePlanRequirement(enterpriseModule.requiresPlanLevel);
    const registry = registryDecision({
      moduleCode: enterpriseModule.moduleCode,
      sectorCode: organization.sectorCode,
      businessSubtypeCode,
      fallbackRequiredPlan: configuredPlan,
    });
    const requiredPlan = registry.requiredPlan;
    const includedInPlan = planMeetsRequirement(planCode, requiredPlan);
    const requiresActiveSubscription = moduleRequiresActiveSubscription(enterpriseModule.moduleCode, requiredPlan);
    const decision = registry.denial || decideAccess({
      label: registry.canonicalCode || enterpriseModule.moduleCode,
      organizationStatus: organization.status,
      planCode,
      subscriptionActive,
      requiredPlan,
      requiresActiveSubscription,
      enabled: enterpriseModule.isEnabled,
    });
    return {
      id: enterpriseModule.id,
      moduleCode: enterpriseModule.moduleCode,
      canonicalCode: registry.canonicalCode,
      implementationStatus: registry.implementationStatus,
      isEnabled: enterpriseModule.isEnabled,
      isCore: enterpriseModule.isCore,
      requiredPlan,
      includedInPlan,
      allowed: decision.allowed,
      code: decision.code,
      message: decision.message,
    };
  });

  return {
    organizationId: organization.id,
    organizationStatus: organization.status,
    organizationType: organization.organizationType,
    sectorCode: organization.sectorCode,
    isDtscInternal: false,
    offerId: commercialContext.offer?.id || null,
    offerName: commercialContext.offer?.name || null,
    offerSlug: commercialContext.offer?.slug || null,
    commercialSource: commercialContext.source === "ORGANIZATION_LEGACY_MAPPED" ? "ORGANIZATION_LEGACY_MAPPED" : commercialContext.source === "ORGANIZATION_SUBSCRIPTION" ? "ORGANIZATION_SUBSCRIPTION" : "ORGANIZATION_BASELINE",
    planCode,
    planLabel: commercialContext.capabilityLabel,
    capabilityLabel: commercialContext.capabilityLabel,
    subscriptionStatus: commercialContext.subscriptionStatus,
    subscriptionActive,
    subscriptionId: commercialContext.subscriptionId,
    trialEndsAt: commercialContext.trialEndsAt?.toISOString() || null,
    startedAt: commercialContext.startedAt?.toISOString() || null,
    expiresAt: commercialContext.expiresAt?.toISOString() || null,
    dailyMessageLimit: commercialContext.dailyMessageLimit,
    dailyTokenLimit: commercialContext.dailyTokenLimit,
    maxDocuments: commercialContext.maxDocuments,
    limits,
    modules,
  };
}

function decideAccess({
  label,
  organizationStatus,
  planCode,
  subscriptionActive,
  requiredPlan,
  requiresActiveSubscription,
  enabled,
}: {
  label: string;
  organizationStatus: string;
  planCode: SaasPlanCode;
  subscriptionActive: boolean;
  requiredPlan: SaasPlanCode;
  requiresActiveSubscription: boolean;
  enabled?: boolean;
}): EntitlementDecision {
  if (organizationStatus !== "ACTIVE" && label !== FEATURE_ENTITLEMENTS.support.label) {
    return { allowed: false, code: "ORGANIZATION_INACTIVE", message: inactiveOrganizationMessage(organizationStatus), requiredPlan };
  }
  if (!planMeetsRequirement(planCode, requiredPlan)) {
    return { allowed: false, code: "PLAN_REQUIRED", message: planRequiredMessage(label, requiredPlan), requiredPlan };
  }
  if (requiresActiveSubscription && !subscriptionActive) {
    return { allowed: false, code: "SUBSCRIPTION_REQUIRED", message: subscriptionRequiredMessage(label), requiredPlan };
  }
  if (enabled === false) {
    return { allowed: false, code: "MODULE_DISABLED", message: `${label} est désactivé pour cette organisation.`, requiredPlan };
  }
  return { allowed: true, code: "OK", message: "Accès autorisé.", requiredPlan };
}

export async function canUseFeature(organizationId: string | null | undefined, feature: SaasFeatureCode): Promise<EntitlementDecision> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  const entitlement = FEATURE_ENTITLEMENTS[feature];
  if (!entitlements) {
    return { allowed: false, code: "ORGANIZATION_INACTIVE", message: "Aucun espace organisation actif.", requiredPlan: entitlement.requiredPlan };
  }
  if (entitlements.isDtscInternal) {
    return { allowed: true, code: "OK", message: "Accès autorisé.", requiredPlan: entitlement.requiredPlan };
  }
  return decideAccess({
    label: entitlement.label,
    organizationStatus: entitlements.organizationStatus,
    planCode: entitlements.planCode,
    subscriptionActive: entitlements.subscriptionActive,
    requiredPlan: entitlement.requiredPlan,
    requiresActiveSubscription: entitlement.requiresActiveSubscription,
  });
}

export async function canUseModule(organizationId: string | null | undefined, moduleCode: string): Promise<EntitlementDecision> {
  const canonicalCode = normalizeEnterpriseModuleCode(moduleCode);
  const definition = getEnterpriseModuleDefinition(canonicalCode);
  if (!definition) {
    return { allowed: false, code: "MODULE_NOT_FOUND", message: "Ce code module est absent du registre canonique." };
  }
  if (!isEnterpriseModuleImplemented(definition.code) || definition.routeKind === "HIDDEN") {
    return { allowed: false, code: "MODULE_NOT_IMPLEMENTED", message: "Ce module n'est pas encore disponible dans DTSC Platform.", requiredPlan: definition.minimumPlan };
  }
  if (definition.routeKind === "ADMIN_SECTION") {
    return { allowed: false, code: "ADMIN_SECTION_ONLY", message: "Cette fonction appartient à l'administration entreprise.", requiredPlan: definition.minimumPlan };
  }

  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) {
    return { allowed: false, code: "ORGANIZATION_INACTIVE", message: "Aucun espace organisation actif." };
  }
  if (!isEnterpriseModuleSectorCompatible(definition, entitlements.sectorCode)) {
    return { allowed: false, code: "SECTOR_INCOMPATIBLE", message: "Ce module n'est pas compatible avec le secteur de l'entreprise active.", requiredPlan: definition.minimumPlan };
  }
  if (entitlements.isDtscInternal) {
    return { allowed: true, code: "OK", message: "Accès autorisé.", requiredPlan: "ENTERPRISE" };
  }

  const candidates = entitlements.modules.filter((item) => normalizeEnterpriseModuleCode(item.moduleCode) === canonicalCode);
  const enterpriseModule = candidates.find((item) => item.moduleCode === canonicalCode) || candidates[0];
  if (!enterpriseModule) {
    return { allowed: false, code: "MODULE_NOT_FOUND", message: "Ce module n'est pas configuré pour cette organisation." };
  }
  return {
    allowed: enterpriseModule.allowed,
    code: enterpriseModule.code,
    message: enterpriseModule.message,
    requiredPlan: enterpriseModule.requiredPlan,
  };
}

export async function assertCanUseModule(organizationId: string | null | undefined, moduleCode: string) {
  const decision = await canUseModule(organizationId, moduleCode);
  if (!decision.allowed) throw new SaasEntitlementError(decision);
  return decision;
}

export async function getOrganizationUsageLimits(organizationId: string | null | undefined): Promise<OrganizationUsageLimits | null> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  return entitlements?.limits || null;
}
