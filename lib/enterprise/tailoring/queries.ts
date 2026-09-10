import type { TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";
import { prisma } from "@/lib/prisma";

type TailoringReferenceAccess = {
  customers?: boolean;
  catalog?: boolean;
  productionOrders?: boolean;
  employees?: boolean;
  workCenters?: boolean;
  boms?: boolean;
  routings?: boolean;
  qualityChecks?: boolean;
  measurements?: boolean;
};

export async function getTailoringReferences(organizationId: string, access: TailoringReferenceAccess = {}) {
  const [configuration, customers, catalogItems, productionOrders, employees, workCenters, boms, routings, qualityChecks, measurementProfiles] = await Promise.all([
    prisma.enterpriseTailoringConfiguration.findUnique({ where: { organizationId } }),
    access.customers
      ? prisma.enterpriseBusinessParty.findMany({
          where: { organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
          select: { id: true, code: true, legalName: true, displayName: true, primaryPhone: true, primaryEmail: true },
          orderBy: { legalName: "asc" },
          take: 1000,
        })
      : Promise.resolve([]),
    access.catalog
      ? prisma.enterpriseCatalogItem.findMany({
          where: { organizationId, status: "ACTIVE", archivedAt: null },
          select: { id: true, code: true, name: true, itemType: true, trackInventory: true, unitOfMeasure: { select: { code: true, name: true, symbol: true } } },
          orderBy: { name: "asc" },
          take: 1000,
        })
      : Promise.resolve([]),
    access.productionOrders
      ? prisma.enterpriseProductionOrder.findMany({
          where: { organizationId, archivedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] } },
          select: { id: true, reference: true, title: true, status: true, outputCatalogItemId: true, salesOrderId: true, plannedQuantity: true, producedQuantity: true, bomId: true, routingId: true },
          orderBy: { updatedAt: "desc" },
          take: 500,
        })
      : Promise.resolve([]),
    access.employees
      ? prisma.enterpriseEmployee.findMany({
          where: { organizationId, archivedAt: null, employmentStatus: "ACTIVE" },
          select: { id: true, employeeNumber: true, displayName: true, siteId: true },
          orderBy: { displayName: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    access.workCenters
      ? prisma.enterpriseManufacturingWorkCenter.findMany({
          where: { organizationId, archivedAt: null, status: "ACTIVE" },
          select: { id: true, code: true, name: true, siteId: true, assetId: true },
          orderBy: { name: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    access.boms
      ? prisma.enterpriseBillOfMaterial.findMany({
          where: { organizationId, archivedAt: null, status: "ACTIVE" },
          select: { id: true, code: true, name: true, catalogItemId: true, version: true },
          orderBy: { updatedAt: "desc" },
          take: 500,
        })
      : Promise.resolve([]),
    access.routings
      ? prisma.enterpriseManufacturingRouting.findMany({
          where: { organizationId, archivedAt: null, status: "ACTIVE" },
          select: { id: true, code: true, name: true, catalogItemId: true, version: true },
          orderBy: { updatedAt: "desc" },
          take: 500,
        })
      : Promise.resolve([]),
    access.qualityChecks
      ? prisma.enterpriseProductionQualityCheck.findMany({
          where: { organizationId },
          select: { id: true, productionOrderId: true, checkType: true, result: true, quantityChecked: true, quantityAccepted: true, quantityRejected: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : Promise.resolve([]),
    access.measurements
      ? prisma.enterpriseTailoringMeasurementProfile.findMany({
          where: { organizationId, archivedAt: null, status: "ACTIVE" },
          select: { id: true, businessPartyId: true, label: true, version: true, measuredAt: true },
          orderBy: { measuredAt: "desc" },
          take: 500,
        })
      : Promise.resolve([]),
  ]);

  return { configuration, customers, catalogItems, productionOrders, employees, workCenters, boms, routings, qualityChecks, measurementProfiles };
}

export async function getTailoringOverview(organizationId: string) {
  const [measurementProfiles, activeStyles, cuttingPlans, scheduledFittings, openAlterations, bundlesByStatus, finishingByStatus] = await Promise.all([
    prisma.enterpriseTailoringMeasurementProfile.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseTailoringStyle.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseTailoringCuttingPlan.groupBy({ where: { organizationId }, by: ["status"], _count: { _all: true }, _sum: { plannedQuantity: true, cutQuantity: true, wasteQuantity: true } }),
    prisma.enterpriseTailoringFitting.count({ where: { organizationId, status: "SCHEDULED" } }),
    prisma.enterpriseTailoringAlteration.count({ where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.enterpriseTailoringGarmentBundle.groupBy({ where: { organizationId }, by: ["status"], _count: { _all: true }, _sum: { quantity: true } }),
    prisma.enterpriseTailoringFinishingRecord.groupBy({ where: { organizationId }, by: ["status"], _count: { _all: true } }),
  ]);
  return { measurementProfiles, activeStyles, cuttingPlans, scheduledFittings, openAlterations, bundlesByStatus, finishingByStatus };
}

export async function getTailoringModuleData(organizationId: string, moduleCode: TailoringModuleCode) {
  if (moduleCode === "TAILORING_OVERVIEW") return { overview: await getTailoringOverview(organizationId) };

  if (moduleCode === "TAILORING_MEASUREMENTS") {
    return {
      measurementProfiles: await prisma.enterpriseTailoringMeasurementProfile.findMany({
        where: { organizationId, archivedAt: null },
        include: { values: { orderBy: { measurementCode: "asc" } } },
        orderBy: [{ businessPartyId: "asc" }, { version: "desc" }],
        take: 1000,
      }),
    };
  }

  if (moduleCode === "TAILORING_STYLES_PATTERNS" || moduleCode === "TAILORING_SIZE_GRADING") {
    return {
      styles: await prisma.enterpriseTailoringStyle.findMany({
        where: { organizationId, archivedAt: null },
        include: { sizeGrades: { include: { rules: true }, orderBy: { sequence: "asc" } } },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 1000,
      }),
    };
  }

  if (moduleCode === "TAILORING_MATERIAL_PROFILES") {
    return {
      materialProfiles: await prisma.enterpriseTailoringMaterialProfile.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: [{ profileType: "asc" }, { updatedAt: "desc" }],
        take: 1000,
      }),
    };
  }

  if (moduleCode === "TAILORING_CUTTING_PLANS") {
    return {
      cuttingPlans: await prisma.enterpriseTailoringCuttingPlan.findMany({
        where: { organizationId },
        include: { style: { select: { id: true, code: true, name: true, garmentType: true, operatingMode: true } } },
        orderBy: { updatedAt: "desc" },
        take: 1000,
      }),
    };
  }

  if (moduleCode === "TAILORING_FITTINGS") {
    return {
      fittings: await prisma.enterpriseTailoringFitting.findMany({
        where: { organizationId },
        include: { measurementProfile: { select: { id: true, businessPartyId: true, label: true, version: true, measuredAt: true } }, alterations: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    };
  }

  if (moduleCode === "TAILORING_ALTERATIONS") {
    return {
      alterations: await prisma.enterpriseTailoringAlteration.findMany({
        where: { organizationId },
        include: { fitting: { select: { id: true, reference: true, result: true, status: true, sequence: true } } },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        take: 1000,
      }),
    };
  }

  if (moduleCode === "TAILORING_GARMENT_TRACKING") {
    return {
      garmentBundles: await prisma.enterpriseTailoringGarmentBundle.findMany({
        where: { organizationId },
        include: { cuttingPlan: { select: { id: true, reference: true, status: true } }, finishingRecords: { select: { id: true, status: true, completedAt: true } } },
        orderBy: { updatedAt: "desc" },
        take: 1000,
      }),
    };
  }

  return {
    finishingRecords: await prisma.enterpriseTailoringFinishingRecord.findMany({
      where: { organizationId },
      include: { garmentBundle: { select: { id: true, bundleCode: true, quantity: true, sizeCode: true, status: true } } },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
  };
}
