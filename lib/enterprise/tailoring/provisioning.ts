import { MANUFACTURING_SECTOR_CODE } from "@/lib/enterprise/manufacturing/constants";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";
import {
  TAILORING_BUSINESS_SUBTYPE_CODE,
  TAILORING_MODULE_CODES,
} from "@/lib/enterprise/tailoring/constants";

const TAILORING_POSITIONS = [
  {
    positionCode: "TAILORING_WORKSHOP_MANAGER",
    labelFr: "Responsable atelier couture",
    labelEn: "Tailoring workshop manager",
    hierarchyLevel: 4,
    isKeyPosition: true,
    permissions: ["enterprise.tailoring.manage", "enterprise.manufacturing.overview.view", "enterprise.manufacturing.orders.view"],
  },
  {
    positionCode: "TAILORING_CUTTER",
    labelFr: "Coupeur / Coupeuse",
    labelEn: "Cutter",
    hierarchyLevel: 2,
    isKeyPosition: false,
    permissions: ["enterprise.tailoring.cutting.view", "enterprise.tailoring.cutting.create", "enterprise.tailoring.garments.view", "enterprise.tailoring.garments.update"],
  },
  {
    positionCode: "TAILORING_SEWER",
    labelFr: "Couturier / Couturière",
    labelEn: "Tailor / sewer",
    hierarchyLevel: 2,
    isKeyPosition: false,
    permissions: ["enterprise.tailoring.garments.view", "enterprise.tailoring.garments.update", "enterprise.tailoring.alterations.view", "enterprise.tailoring.alterations.update", "enterprise.manufacturing.execution.view"],
  },
  {
    positionCode: "TAILORING_FITTER",
    labelFr: "Responsable essayage",
    labelEn: "Fitting specialist",
    hierarchyLevel: 2,
    isKeyPosition: false,
    permissions: ["enterprise.tailoring.measurements.view", "enterprise.tailoring.measurements.create", "enterprise.tailoring.fittings.view", "enterprise.tailoring.fittings.create", "enterprise.tailoring.alterations.create"],
  },
  {
    positionCode: "TAILORING_QUALITY_CONTROLLER",
    labelFr: "Contrôleur qualité habillement",
    labelEn: "Apparel quality controller",
    hierarchyLevel: 3,
    isKeyPosition: false,
    permissions: ["enterprise.tailoring.finishing.view", "enterprise.tailoring.finishing.update", "enterprise.manufacturing.quality.view", "enterprise.manufacturing.quality.create"],
  },
] as const;

export function isTailoringApparelSubtype(sectorCode: string | null | undefined, businessSubtypeCode: string | null | undefined) {
  return sectorCode === MANUFACTURING_SECTOR_CODE && businessSubtypeCode === TAILORING_BUSINESS_SUBTYPE_CODE;
}

export async function syncTailoringOnboardingProvisioning({
  organizationId,
  sectorCode,
  businessSubtypeCode,
  actorUserId,
}: {
  organizationId: string;
  sectorCode: string | null | undefined;
  businessSubtypeCode: string | null | undefined;
  actorUserId: string;
}) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, sectorId: true, sectorCode: true },
  });
  if (!organization) throw new Error("TAILORING_ORGANIZATION_NOT_FOUND");

  const enabled = isTailoringApparelSubtype(sectorCode, businessSubtypeCode)
    && organization.sectorCode === MANUFACTURING_SECTOR_CODE;

  if (!enabled) {
    const disabled = await prisma.enterpriseModule.updateMany({
      where: { organizationId, moduleCode: { in: [...TAILORING_MODULE_CODES] }, isEnabled: true },
      data: { isEnabled: false },
    });
    return { enabled: false, moduleCount: 0, disabledModuleCount: disabled.count, positionCount: 0 };
  }

  const persistedSubtype = await prisma.enterpriseBusinessSubtypeSelection.findUnique({
    where: { organizationId },
    select: { sectorCode: true, businessSubtypeCode: true },
  });
  if (!persistedSubtype || !isTailoringApparelSubtype(persistedSubtype.sectorCode, persistedSubtype.businessSubtypeCode)) {
    throw new Error("TAILORING_SUBTYPE_SELECTION_REQUIRED");
  }

  await prisma.enterpriseTailoringConfiguration.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      operatingMode: "MIXED",
      defaultMeasurementUnit: "CM",
      createdByUserId: actorUserId,
    },
  });

  let moduleCount = 0;
  for (const moduleCode of TAILORING_MODULE_CODES) {
    const definition = getEnterpriseModuleDefinition(moduleCode);
    if (!definition) throw new Error(`TAILORING_MODULE_DEFINITION_MISSING:${moduleCode}`);
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: {
        sectorId: organization.sectorId,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isCore: false,
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
      create: {
        organizationId,
        sectorId: organization.sectorId,
        moduleCode,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isEnabled: true,
        isCore: false,
        sourceTemplateId: null,
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
    });
    moduleCount += 1;
  }

  let positionCount = 0;
  for (const position of TAILORING_POSITIONS) {
    const existing = await prisma.enterprisePosition.findUnique({
      where: { organizationId_positionCode: { organizationId, positionCode: position.positionCode } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.enterprisePosition.create({
      data: {
        organizationId,
        sectorId: organization.sectorId,
        positionCode: position.positionCode,
        labelFr: position.labelFr,
        labelEn: position.labelEn,
        departmentId: null,
        hierarchyLevel: position.hierarchyLevel,
        descriptionFr: `Poste atelier rattaché au sous-secteur ${TAILORING_BUSINESS_SUBTYPE_CODE}.`,
        descriptionEn: `Workshop position attached to the ${TAILORING_BUSINESS_SUBTYPE_CODE} business subtype.`,
        permissionsJson: [...position.permissions],
        isActive: true,
        isKeyPosition: position.isKeyPosition,
        sourceTemplateId: null,
      },
    });
    positionCount += 1;
  }

  return { enabled: true, moduleCount, disabledModuleCount: 0, positionCount };
}
