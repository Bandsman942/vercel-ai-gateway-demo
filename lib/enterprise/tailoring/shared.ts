import { Prisma } from "@prisma/client";
import { ManufacturingDomainError } from "@/lib/enterprise/manufacturing/errors";
import {
  assertManufacturingOrganization,
  manufacturingNullable,
  requireManufacturingCatalogItem,
  requireManufacturingEmployee,
  withManufacturingSerializable,
  type ManufacturingTransaction,
} from "@/lib/enterprise/manufacturing/shared";
import { TAILORING_BUSINESS_SUBTYPE_CODE } from "@/lib/enterprise/tailoring/constants";
import { TailoringDomainError } from "@/lib/enterprise/tailoring/errors";

export type TailoringTransaction = ManufacturingTransaction;

export function tailoringNullable(value: string | null | undefined) {
  return manufacturingNullable(value);
}

export function tailoringDecimal(value: Prisma.Decimal.Value = 0, places = 3) {
  return new Prisma.Decimal(value).toDecimalPlaces(places);
}

export async function withTailoringSerializable<T>(work: (tx: TailoringTransaction) => Promise<T>, maxAttempts = 3): Promise<T> {
  return withManufacturingSerializable(work, maxAttempts);
}

export async function assertTailoringOrganization(tx: TailoringTransaction, organizationId: string) {
  try {
    const organization = await assertManufacturingOrganization(tx, organizationId);
    const subtype = await tx.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    });
    if (subtype?.sectorCode !== organization.sectorCode || subtype.businessSubtypeCode !== TAILORING_BUSINESS_SUBTYPE_CODE) {
      throw new TailoringDomainError("Cette fonctionnalité est réservée aux entreprises Couture, confection & habillement.", 403, "TAILORING_SUBTYPE_REQUIRED");
    }
    return organization;
  } catch (error) {
    if (error instanceof TailoringDomainError) throw error;
    if (error instanceof ManufacturingDomainError) {
      throw new TailoringDomainError("Cette fonctionnalité est réservée aux entreprises Couture, confection & habillement.", 403, "TAILORING_SUBTYPE_REQUIRED");
    }
    throw error;
  }
}

export async function requireTailoringCustomer(tx: TailoringTransaction, organizationId: string, businessPartyId: string) {
  const customer = await tx.enterpriseBusinessParty.findFirst({
    where: {
      id: businessPartyId,
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
    },
    select: { id: true, code: true, legalName: true, displayName: true, primaryPhone: true, primaryEmail: true },
  });
  if (!customer) throw new TailoringDomainError("Le client sélectionné n’appartient pas aux clients actifs de cette entreprise.", 400, "TAILORING_CUSTOMER_INVALID");
  return customer;
}

export async function requireTailoringCatalogItem(
  tx: TailoringTransaction,
  organizationId: string,
  catalogItemId: string,
  options: { inventoryTracked?: boolean } = {},
) {
  try {
    return await requireManufacturingCatalogItem(tx, organizationId, catalogItemId, options);
  } catch (error) {
    if (error instanceof ManufacturingDomainError) {
      throw new TailoringDomainError(error.message, error.statusCode, `TAILORING_${error.code}`);
    }
    throw error;
  }
}

export async function requireTailoringEmployee(tx: TailoringTransaction, organizationId: string, employeeId?: string | null) {
  try {
    return await requireManufacturingEmployee(tx, organizationId, employeeId);
  } catch (error) {
    if (error instanceof ManufacturingDomainError) {
      throw new TailoringDomainError(error.message, error.statusCode, `TAILORING_${error.code}`);
    }
    throw error;
  }
}

export async function requireTailoringProductionOrder(tx: TailoringTransaction, organizationId: string, productionOrderId: string) {
  const order = await tx.enterpriseProductionOrder.findFirst({
    where: { id: productionOrderId, organizationId, archivedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] } },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      outputCatalogItemId: true,
      bomId: true,
      routingId: true,
      salesOrderId: true,
      salesOrderItemId: true,
      plannedQuantity: true,
      producedQuantity: true,
    },
  });
  if (!order) throw new TailoringDomainError("L’ordre de production sélectionné n’appartient pas à cette entreprise ou n’est plus utilisable.", 400, "TAILORING_PRODUCTION_ORDER_INVALID");
  return order;
}

export async function requireTailoringMaterialRequirement(
  tx: TailoringTransaction,
  organizationId: string,
  productionOrderId: string,
  requirementId?: string | null,
) {
  const id = tailoringNullable(requirementId);
  if (!id) return null;
  const requirement = await tx.enterpriseProductionMaterialRequirement.findFirst({
    where: { id, organizationId, productionOrderId },
    select: { id: true, catalogItemId: true, inventoryItemId: true, warehouseId: true, requiredQuantity: true, consumedQuantity: true, shortageQuantity: true, status: true },
  });
  if (!requirement) throw new TailoringDomainError("Le besoin matière sélectionné ne correspond pas à cet ordre de production.", 400, "TAILORING_MATERIAL_REQUIREMENT_INVALID");
  return requirement;
}

export async function requireTailoringBom(tx: TailoringTransaction, organizationId: string, bomId?: string | null, expectedCatalogItemId?: string | null) {
  const id = tailoringNullable(bomId);
  if (!id) return null;
  const bom = await tx.enterpriseBillOfMaterial.findFirst({
    where: { id, organizationId, archivedAt: null, status: { in: ["DRAFT", "ACTIVE"] } },
    select: { id: true, code: true, catalogItemId: true, version: true, status: true },
  });
  if (!bom) throw new TailoringDomainError("La nomenclature sélectionnée n’appartient pas à cette entreprise.", 400, "TAILORING_BOM_INVALID");
  if (expectedCatalogItemId && bom.catalogItemId !== expectedCatalogItemId) {
    throw new TailoringDomainError("La nomenclature ne correspond pas à l’article du style.", 409, "TAILORING_BOM_ITEM_MISMATCH");
  }
  return bom;
}

export async function requireTailoringRouting(tx: TailoringTransaction, organizationId: string, routingId?: string | null, expectedCatalogItemId?: string | null) {
  const id = tailoringNullable(routingId);
  if (!id) return null;
  const routing = await tx.enterpriseManufacturingRouting.findFirst({
    where: { id, organizationId, archivedAt: null, status: { in: ["DRAFT", "ACTIVE"] } },
    select: { id: true, code: true, catalogItemId: true, version: true, status: true },
  });
  if (!routing) throw new TailoringDomainError("La gamme sélectionnée n’appartient pas à cette entreprise.", 400, "TAILORING_ROUTING_INVALID");
  if (expectedCatalogItemId && routing.catalogItemId && routing.catalogItemId !== expectedCatalogItemId) {
    throw new TailoringDomainError("La gamme ne correspond pas à l’article du style.", 409, "TAILORING_ROUTING_ITEM_MISMATCH");
  }
  return routing;
}

export async function requireTailoringWorkCenter(tx: TailoringTransaction, organizationId: string, workCenterId?: string | null) {
  const id = tailoringNullable(workCenterId);
  if (!id) return null;
  const workCenter = await tx.enterpriseManufacturingWorkCenter.findFirst({
    where: { id, organizationId, archivedAt: null, status: { in: ["ACTIVE", "MAINTENANCE"] } },
    select: { id: true, code: true, name: true, status: true, assetId: true },
  });
  if (!workCenter) throw new TailoringDomainError("Le centre de travail sélectionné n’appartient pas à cette entreprise.", 400, "TAILORING_WORK_CENTER_INVALID");
  return workCenter;
}

export async function requireTailoringQualityCheck(
  tx: TailoringTransaction,
  organizationId: string,
  productionOrderId: string,
  qualityCheckId?: string | null,
) {
  const id = tailoringNullable(qualityCheckId);
  if (!id) return null;
  const check = await tx.enterpriseProductionQualityCheck.findFirst({
    where: { id, organizationId, productionOrderId },
    select: { id: true, result: true, checkType: true, quantityChecked: true, quantityAccepted: true, quantityRejected: true },
  });
  if (!check) throw new TailoringDomainError("Le contrôle qualité sélectionné ne correspond pas à cet ordre de production.", 400, "TAILORING_QUALITY_CHECK_INVALID");
  return check;
}
