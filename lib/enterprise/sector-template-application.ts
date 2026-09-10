import {
  applySectorTemplateToOrganization,
  type ApplySectorTemplateMode,
} from "@/lib/enterprise-sector-templates";
import {
  getBusinessSubtypeForSector,
  type BusinessSubtypeCode,
} from "@/lib/enterprise/business-subtype-registry";
import {
  getBusinessSubtypeSelection,
  persistBusinessSubtypeSelection,
} from "@/lib/enterprise/business-subtype-selection";
import { ensureCanonicalCommonModulesForOrganization } from "@/lib/enterprise/common-modules";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleBusinessSubtypeCompatible,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleSectorCompatible,
  normalizeEnterpriseModuleCode,
} from "@/lib/enterprise/module-registry";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { syncRetailOnboardingProvisioning } from "@/lib/enterprise/retail/provisioning";
import { normalizeRetailBusinessSubtypeCode } from "@/lib/enterprise/retail/subtype-registry";
import { syncTailoringOnboardingProvisioning } from "@/lib/enterprise/tailoring/provisioning";
import { prisma } from "@/lib/prisma";

export async function applyCanonicalSectorTemplateToOrganization({
  organizationId,
  sectorId,
  actorUserId,
  mode = "merge",
  businessSubtypeCode,
}: {
  organizationId: string;
  sectorId: string;
  actorUserId: string;
  mode?: ApplySectorTemplateMode;
  businessSubtypeCode?: BusinessSubtypeCode | null;
}) {
  const targetSector = await prisma.businessSector.findFirst({
    where: { id: sectorId, isActive: true },
    select: { code: true },
  });
  if (!targetSector) {
    throw new Error("SECTOR_TEMPLATE_NOT_FOUND");
  }

  if (businessSubtypeCode && !getBusinessSubtypeForSector(targetSector.code, businessSubtypeCode)) {
    throw new Error("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH");
  }

  const existingSelection = businessSubtypeCode === undefined
    ? await getBusinessSubtypeSelection(organizationId)
    : null;
  const resolvedBusinessSubtypeCode: BusinessSubtypeCode | null = businessSubtypeCode === undefined
    ? existingSelection?.sectorCode === targetSector.code
      ? existingSelection.businessSubtypeCode
      : null
    : businessSubtypeCode;
  const retailSubtypeForApply = targetSector.code === RETAIL_SECTOR_CODE
    ? normalizeRetailBusinessSubtypeCode(resolvedBusinessSubtypeCode)
    : null;

  const result = await applySectorTemplateToOrganization({
    organizationId,
    sectorId,
    actorUserId,
    mode,
    businessSubtypeCode: retailSubtypeForApply,
  });
  const retailProvisioning = await syncRetailOnboardingProvisioning({
    organizationId,
    sectorCode: result.sectorCode,
    actorUserId,
    businessSubtypeCode: result.businessSubtypeCode,
  });
  const subtypeSelection = await persistBusinessSubtypeSelection({
    organizationId,
    sectorCode: result.sectorCode,
    businessSubtypeCode: resolvedBusinessSubtypeCode,
    actorUserId,
    source: "SECTOR_TEMPLATE",
  });
  const tailoringProvisioning = await syncTailoringOnboardingProvisioning({
    organizationId,
    sectorCode: result.sectorCode,
    businessSubtypeCode: resolvedBusinessSubtypeCode,
    actorUserId,
  });
  const commonModules = await ensureCanonicalCommonModulesForOrganization({ organizationId });
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: {
      sectorCode: true,
      enterpriseModules: {
        select: { id: true, moduleCode: true, isEnabled: true },
      },
      enterpriseActivityBlocks: {
        select: { id: true, targetModuleCode: true, isEnabled: true },
      },
    },
  });
  if (!organization) {
    return {
      ...result,
      businessSubtypeCode: resolvedBusinessSubtypeCode,
      subtypeSelection,
      commonModuleCount: commonModules.length,
      retailProvisioning,
      tailoringProvisioning,
    };
  }

  const moduleIdsToDisable = new Set<string>();
  const activityBlockIdsToDisable = new Set<string>();
  const canonicalRows = new Set(
    organization.enterpriseModules
      .filter((tenantModule) => tenantModule.moduleCode === normalizeEnterpriseModuleCode(tenantModule.moduleCode))
      .map((tenantModule) => tenantModule.moduleCode),
  );

  for (const tenantModule of organization.enterpriseModules) {
    const canonicalCode = normalizeEnterpriseModuleCode(tenantModule.moduleCode);
    const definition = getEnterpriseModuleDefinition(canonicalCode);
    const aliasIsDuplicated = tenantModule.moduleCode !== canonicalCode && canonicalRows.has(canonicalCode);
    const mustRemainDisabled =
      !definition ||
      !isEnterpriseModuleImplemented(canonicalCode) ||
      !isEnterpriseModuleSectorCompatible(definition, organization.sectorCode) ||
      !isEnterpriseModuleBusinessSubtypeCompatible(definition, resolvedBusinessSubtypeCode) ||
      definition.routeKind === "ADMIN_SECTION" ||
      definition.routeKind === "HIDDEN" ||
      aliasIsDuplicated;
    if (tenantModule.isEnabled && mustRemainDisabled) {
      moduleIdsToDisable.add(tenantModule.id);
    }
  }

  for (const activityBlock of organization.enterpriseActivityBlocks) {
    if (!activityBlock.targetModuleCode) {
      continue;
    }
    const definition = getEnterpriseModuleDefinition(activityBlock.targetModuleCode);
    if (
      !definition ||
      !isEnterpriseModuleImplemented(definition.code) ||
      !isEnterpriseModuleSectorCompatible(definition, organization.sectorCode) ||
      !isEnterpriseModuleBusinessSubtypeCompatible(definition, resolvedBusinessSubtypeCode) ||
      definition.routeKind === "ADMIN_SECTION" ||
      definition.routeKind === "HIDDEN"
    ) {
      activityBlockIdsToDisable.add(activityBlock.id);
    }
  }

  await prisma.$transaction([
    prisma.enterpriseModule.updateMany({
      where: { id: { in: Array.from(moduleIdsToDisable) } },
      data: { isEnabled: false },
    }),
    prisma.enterpriseActivityBlock.updateMany({
      where: { id: { in: Array.from(activityBlockIdsToDisable) } },
      data: { isEnabled: false },
    }),
  ]);

  return {
    ...result,
    businessSubtypeCode: resolvedBusinessSubtypeCode,
    subtypeSelection,
    commonModuleCount: commonModules.length,
    retailProvisioning,
    tailoringProvisioning,
    registryNormalization: {
      disabledModuleCount: moduleIdsToDisable.size,
      disabledActivityBlockCount: activityBlockIdsToDisable.size,
    },
  };
}