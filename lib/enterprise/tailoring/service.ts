import type { z } from "zod";
import {
  assertActiveManufacturingMember,
  manufacturingReference,
} from "@/lib/enterprise/manufacturing/shared";
import { addEnterpriseOperationalEvent } from "@/lib/enterprise/procurement/shared";
import { TailoringConflictError, TailoringDomainError } from "@/lib/enterprise/tailoring/errors";
import {
  assertTailoringOrganization,
  requireTailoringBom,
  requireTailoringCatalogItem,
  requireTailoringCustomer,
  requireTailoringEmployee,
  requireTailoringMaterialRequirement,
  requireTailoringProductionOrder,
  requireTailoringQualityCheck,
  requireTailoringRouting,
  requireTailoringWorkCenter,
  tailoringDecimal,
  tailoringNullable,
  withTailoringSerializable,
} from "@/lib/enterprise/tailoring/shared";
import {
  tailoringAlterationCreateSchema,
  tailoringAlterationUpdateSchema,
  tailoringConfigurationSchema,
  tailoringCuttingPlanCreateSchema,
  tailoringCuttingPlanUpdateSchema,
  tailoringDefinitionActionSchema,
  tailoringFinishingSchema,
  tailoringFittingCompleteSchema,
  tailoringFittingCreateSchema,
  tailoringGarmentBundleCreateSchema,
  tailoringGarmentBundleUpdateSchema,
  tailoringMaterialProfileSchema,
  tailoringMeasurementProfileCreateSchema,
  tailoringSizeGradeCreateSchema,
  tailoringStyleCreateSchema,
} from "@/lib/enterprise/tailoring/validators";

type ConfigurationInput = z.infer<typeof tailoringConfigurationSchema>;
type MeasurementInput = z.infer<typeof tailoringMeasurementProfileCreateSchema>;
type StyleInput = z.infer<typeof tailoringStyleCreateSchema>;
type DefinitionActionInput = z.infer<typeof tailoringDefinitionActionSchema>;
type SizeGradeInput = z.infer<typeof tailoringSizeGradeCreateSchema>;
type MaterialProfileInput = z.infer<typeof tailoringMaterialProfileSchema>;
type CuttingPlanInput = z.infer<typeof tailoringCuttingPlanCreateSchema>;
type CuttingPlanUpdateInput = z.infer<typeof tailoringCuttingPlanUpdateSchema>;
type FittingInput = z.infer<typeof tailoringFittingCreateSchema>;
type FittingCompleteInput = z.infer<typeof tailoringFittingCompleteSchema>;
type AlterationInput = z.infer<typeof tailoringAlterationCreateSchema>;
type AlterationUpdateInput = z.infer<typeof tailoringAlterationUpdateSchema>;
type GarmentBundleInput = z.infer<typeof tailoringGarmentBundleCreateSchema>;
type GarmentBundleUpdateInput = z.infer<typeof tailoringGarmentBundleUpdateSchema>;
type FinishingInput = z.infer<typeof tailoringFinishingSchema>;

const CUTTING_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const ALTERATION_TRANSITIONS: Record<string, readonly string[]> = {
  OPEN: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const BUNDLE_TRANSITIONS: Record<string, readonly string[]> = {
  CUT: ["SEWING"],
  SEWING: ["FITTING", "ALTERATION", "FINISHING"],
  FITTING: ["ALTERATION", "FINISHING"],
  ALTERATION: ["SEWING", "FITTING", "FINISHING"],
  FINISHING: ["READY_FOR_DELIVERY"],
  READY_FOR_DELIVERY: [],
};

async function requireActor(tx: Parameters<Parameters<typeof withTailoringSerializable>[0]>[0], organizationId: string, actorUserId: string) {
  await assertTailoringOrganization(tx, organizationId);
  await assertActiveManufacturingMember(tx, organizationId, actorUserId);
}

function assertTransition(current: string, next: string, transitions: Record<string, readonly string[]>, code: string) {
  if (current === next) return;
  if (!(transitions[current] || []).includes(next)) {
    throw new TailoringDomainError("Cette transition n’est pas autorisée dans le parcours atelier.", 409, code);
  }
}

export async function updateTailoringConfiguration(organizationId: string, actorUserId: string, input: ConfigurationInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const current = await tx.enterpriseTailoringConfiguration.findUnique({ where: { organizationId } });
    if (!current) throw new TailoringDomainError("La configuration Couture doit d’abord être provisionnée.", 409, "TAILORING_CONFIGURATION_REQUIRED");
    if (current.revision !== input.revision) throw new TailoringConflictError();
    const updated = await tx.enterpriseTailoringConfiguration.update({
      where: { organizationId },
      data: {
        operatingMode: input.operatingMode,
        defaultMeasurementUnit: input.defaultMeasurementUnit,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseTailoringConfiguration",
      entityId: updated.id,
      eventType: "TAILORING_CONFIGURATION_UPDATED",
      summary: "Configuration atelier mise à jour.",
      actorUserId,
      metadata: { operatingMode: updated.operatingMode, defaultMeasurementUnit: updated.defaultMeasurementUnit },
    });
    return updated;
  });
}

export async function createTailoringMeasurementProfile(organizationId: string, actorUserId: string, input: MeasurementInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const [customer, employee, latest] = await Promise.all([
      requireTailoringCustomer(tx, organizationId, input.businessPartyId),
      requireTailoringEmployee(tx, organizationId, input.measuredByEmployeeId),
      tx.enterpriseTailoringMeasurementProfile.findFirst({
        where: { organizationId, businessPartyId: input.businessPartyId },
        orderBy: { version: "desc" },
        select: { version: true },
      }),
    ]);
    const version = (latest?.version || 0) + 1;
    await tx.enterpriseTailoringMeasurementProfile.updateMany({
      where: { organizationId, businessPartyId: customer.id, status: "ACTIVE", archivedAt: null },
      data: { status: "RETIRED", revision: { increment: 1 } },
    });
    const profile = await tx.enterpriseTailoringMeasurementProfile.create({
      data: {
        organizationId,
        businessPartyId: customer.id,
        label: input.label,
        version,
        status: "ACTIVE",
        measuredAt: input.measuredAt || new Date(),
        measuredByEmployeeId: employee?.id || null,
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
        values: {
          create: input.values.map((value) => ({
            organizationId,
            measurementCode: value.measurementCode,
            value: tailoringDecimal(value.value, 2),
            unit: value.unit,
            notes: tailoringNullable(value.notes),
          })),
        },
      },
      include: { values: true },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseBusinessParty",
      entityId: customer.id,
      eventType: "TAILORING_MEASUREMENTS_RECORDED",
      summary: `Mensurations v${version} enregistrées pour ${customer.displayName || customer.legalName}.`,
      actorUserId,
      metadata: { measurementProfileId: profile.id, version, valueCount: profile.values.length },
    });
    return profile;
  });
}

export async function createTailoringStyle(organizationId: string, actorUserId: string, input: StyleInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const catalogItem = await requireTailoringCatalogItem(tx, organizationId, input.catalogItemId);
    const [bom, routing] = await Promise.all([
      requireTailoringBom(tx, organizationId, input.bomId, catalogItem.id),
      requireTailoringRouting(tx, organizationId, input.routingId, catalogItem.id),
    ]);
    const style = await tx.enterpriseTailoringStyle.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        catalogItemId: catalogItem.id,
        garmentType: input.garmentType,
        operatingMode: input.operatingMode,
        patternReference: tailoringNullable(input.patternReference),
        patternVersion: input.patternVersion,
        bomId: bom?.id || null,
        routingId: routing?.id || null,
        status: "DRAFT",
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseTailoringStyle",
      entityId: style.id,
      eventType: "TAILORING_STYLE_CREATED",
      summary: `Style ${style.code} créé à partir du catalogue commun.`,
      actorUserId,
      metadata: { catalogItemId: catalogItem.id, bomId: bom?.id || null, routingId: routing?.id || null },
    });
    return style;
  });
}

export async function changeTailoringStyleStatus(organizationId: string, styleId: string, actorUserId: string, input: DefinitionActionInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const style = await tx.enterpriseTailoringStyle.findFirst({ where: { id: styleId, organizationId, archivedAt: null } });
    if (!style) throw new TailoringDomainError("Style introuvable.", 404, "TAILORING_STYLE_NOT_FOUND");
    if (style.revision !== input.revision) throw new TailoringConflictError();
    const nextStatus = input.action === "ACTIVATE" ? "ACTIVE" : "RETIRED";
    if (input.action === "ACTIVATE") {
      if (style.bomId) {
        const bom = await tx.enterpriseBillOfMaterial.findFirst({ where: { id: style.bomId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
        if (!bom) throw new TailoringDomainError("Activez la nomenclature liée avant d’activer ce style.", 409, "TAILORING_STYLE_BOM_NOT_ACTIVE");
      }
      if (style.routingId) {
        const routing = await tx.enterpriseManufacturingRouting.findFirst({ where: { id: style.routingId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
        if (!routing) throw new TailoringDomainError("Activez la gamme liée avant d’activer ce style.", 409, "TAILORING_STYLE_ROUTING_NOT_ACTIVE");
      }
    }
    const updated = await tx.enterpriseTailoringStyle.update({
      where: { id: style.id },
      data: { status: nextStatus, updatedByUserId: actorUserId, revision: { increment: 1 }, archivedAt: nextStatus === "RETIRED" ? new Date() : null },
    });
    return updated;
  });
}

export async function createTailoringSizeGrade(organizationId: string, actorUserId: string, input: SizeGradeInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const style = await tx.enterpriseTailoringStyle.findFirst({ where: { id: input.styleId, organizationId, archivedAt: null, status: { in: ["DRAFT", "ACTIVE"] } } });
    if (!style) throw new TailoringDomainError("Le style sélectionné n’appartient pas à cet atelier.", 400, "TAILORING_STYLE_INVALID");
    if (style.operatingMode === "MADE_TO_MEASURE") {
      throw new TailoringDomainError("La gradation s’applique aux styles prêt-à-porter ou mixtes, pas à un style uniquement sur mesure.", 409, "TAILORING_GRADING_NOT_APPLICABLE");
    }
    return tx.enterpriseTailoringSizeGrade.create({
      data: {
        organizationId,
        styleId: style.id,
        sizeCode: input.sizeCode,
        baseSizeCode: tailoringNullable(input.baseSizeCode)?.toUpperCase() || null,
        sequence: input.sequence,
        status: "ACTIVE",
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
        rules: {
          create: input.rules.map((rule) => ({
            organizationId,
            measurementCode: rule.measurementCode,
            deltaValue: tailoringDecimal(rule.deltaValue, 2),
            unit: rule.unit,
          })),
        },
      },
      include: { rules: true },
    });
  });
}

export async function createTailoringMaterialProfile(organizationId: string, actorUserId: string, input: MaterialProfileInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const catalogItem = await requireTailoringCatalogItem(tx, organizationId, input.catalogItemId, { inventoryTracked: true });
    const existing = await tx.enterpriseTailoringMaterialProfile.findFirst({ where: { organizationId, catalogItemId: catalogItem.id, archivedAt: null }, select: { id: true } });
    if (existing) throw new TailoringDomainError("Cet article possède déjà un profil tissu ou fourniture.", 409, "TAILORING_MATERIAL_PROFILE_EXISTS");
    return tx.enterpriseTailoringMaterialProfile.create({
      data: {
        organizationId,
        catalogItemId: catalogItem.id,
        profileType: input.profileType,
        fabricWidthCm: input.fabricWidthCm == null ? null : tailoringDecimal(input.fabricWidthCm, 2),
        usableWidthCm: input.usableWidthCm == null ? null : tailoringDecimal(input.usableWidthCm, 2),
        shrinkageRate: input.shrinkageRate == null ? null : tailoringDecimal(input.shrinkageRate / 100, 4),
        grainDirection: input.grainDirection || null,
        colorFamily: tailoringNullable(input.colorFamily),
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
      },
    });
  });
}

export async function createTailoringCuttingPlan(organizationId: string, actorUserId: string, input: CuttingPlanInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const order = await requireTailoringProductionOrder(tx, organizationId, input.productionOrderId);
    const fabric = await requireTailoringCatalogItem(tx, organizationId, input.fabricCatalogItemId, { inventoryTracked: true });
    const materialProfile = await tx.enterpriseTailoringMaterialProfile.findFirst({
      where: { organizationId, catalogItemId: fabric.id, profileType: "FABRIC", archivedAt: null },
    });
    if (!materialProfile) throw new TailoringDomainError("Créez d’abord le profil tissu de cet article avant de préparer un plan de coupe.", 409, "TAILORING_FABRIC_PROFILE_REQUIRED");
    const requirement = await requireTailoringMaterialRequirement(tx, organizationId, order.id, input.materialRequirementId);
    if (requirement && requirement.catalogItemId !== fabric.id) {
      throw new TailoringDomainError("Le tissu du plan de coupe ne correspond pas au besoin matière sélectionné.", 409, "TAILORING_CUTTING_REQUIREMENT_ITEM_MISMATCH");
    }
    let styleId: string | null = null;
    if (input.styleId) {
      const style = await tx.enterpriseTailoringStyle.findFirst({ where: { id: input.styleId, organizationId, archivedAt: null, status: "ACTIVE" } });
      if (!style) throw new TailoringDomainError("Le style sélectionné doit être actif.", 400, "TAILORING_CUTTING_STYLE_INVALID");
      if (style.catalogItemId !== order.outputCatalogItemId) {
        throw new TailoringDomainError("Le style sélectionné ne correspond pas au produit fabriqué par l’ordre.", 409, "TAILORING_CUTTING_STYLE_ITEM_MISMATCH");
      }
      styleId = style.id;
    }
    const plan = await tx.enterpriseTailoringCuttingPlan.create({
      data: {
        organizationId,
        reference: manufacturingReference("CUT"),
        productionOrderId: order.id,
        styleId,
        materialRequirementId: requirement?.id || null,
        fabricCatalogItemId: fabric.id,
        status: "DRAFT",
        fabricWidthCm: input.fabricWidthCm == null ? materialProfile.fabricWidthCm : tailoringDecimal(input.fabricWidthCm, 2),
        markerLengthCm: input.markerLengthCm == null ? null : tailoringDecimal(input.markerLengthCm, 2),
        layers: input.layers,
        plannedQuantity: tailoringDecimal(input.plannedQuantity),
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: order.id,
      eventType: "TAILORING_CUTTING_PLAN_CREATED",
      summary: `Plan de coupe ${plan.reference} créé pour ${order.reference}.`,
      actorUserId,
      metadata: { cuttingPlanId: plan.id, styleId, materialRequirementId: requirement?.id || null, fabricCatalogItemId: fabric.id },
    });
    return plan;
  });
}

export async function updateTailoringCuttingPlan(organizationId: string, planId: string, actorUserId: string, input: CuttingPlanUpdateInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const plan = await tx.enterpriseTailoringCuttingPlan.findFirst({ where: { id: planId, organizationId } });
    if (!plan) throw new TailoringDomainError("Plan de coupe introuvable.", 404, "TAILORING_CUTTING_PLAN_NOT_FOUND");
    if (plan.revision !== input.revision) throw new TailoringConflictError();
    assertTransition(plan.status, input.status, CUTTING_TRANSITIONS, "TAILORING_CUTTING_TRANSITION_INVALID");
    if (input.status === "COMPLETED" && input.cutQuantity <= 0) {
      throw new TailoringDomainError("Renseignez une quantité coupée avant de terminer le plan.", 409, "TAILORING_CUTTING_QUANTITY_REQUIRED");
    }
    const updated = await tx.enterpriseTailoringCuttingPlan.update({
      where: { id: plan.id },
      data: {
        status: input.status,
        cutQuantity: tailoringDecimal(input.cutQuantity),
        wasteQuantity: tailoringDecimal(input.wasteQuantity),
        markerEfficiency: input.markerEfficiency == null ? null : tailoringDecimal(input.markerEfficiency / 100, 4),
        notes: tailoringNullable(input.notes),
        updatedByUserId: actorUserId,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        revision: { increment: 1 },
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: plan.productionOrderId,
      eventType: "TAILORING_CUTTING_PLAN_UPDATED",
      summary: `Plan de coupe ${plan.reference} : ${input.status}.`,
      actorUserId,
      metadata: { cuttingPlanId: plan.id, cutQuantity: String(input.cutQuantity), wasteQuantity: String(input.wasteQuantity), inventoryWasteRecordedSeparately: true },
    });
    return updated;
  });
}

export async function createTailoringFitting(organizationId: string, actorUserId: string, input: FittingInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const order = await requireTailoringProductionOrder(tx, organizationId, input.productionOrderId);
    const employee = await requireTailoringEmployee(tx, organizationId, input.fittedByEmployeeId);
    let measurementProfileId: string | null = null;
    if (input.measurementProfileId) {
      const profile = await tx.enterpriseTailoringMeasurementProfile.findFirst({
        where: { id: input.measurementProfileId, organizationId, archivedAt: null, status: "ACTIVE" },
        select: { id: true },
      });
      if (!profile) throw new TailoringDomainError("Le profil de mensurations sélectionné n’est pas actif dans cet atelier.", 400, "TAILORING_MEASUREMENT_PROFILE_INVALID");
      measurementProfileId = profile.id;
    }
    const orderStyle = await tx.enterpriseTailoringCuttingPlan.findFirst({
      where: { organizationId, productionOrderId: order.id, styleId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { style: { select: { operatingMode: true } } },
    });
    const configuration = await tx.enterpriseTailoringConfiguration.findUnique({ where: { organizationId }, select: { operatingMode: true } });
    const madeToMeasure = orderStyle?.style?.operatingMode === "MADE_TO_MEASURE" || (!orderStyle?.style && configuration?.operatingMode === "MADE_TO_MEASURE");
    if (madeToMeasure && !measurementProfileId) {
      throw new TailoringDomainError("Un essayage sur mesure doit être relié aux mensurations actives du client.", 409, "TAILORING_FITTING_MEASUREMENTS_REQUIRED");
    }
    const latest = await tx.enterpriseTailoringFitting.findFirst({
      where: { organizationId, productionOrderId: order.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const fitting = await tx.enterpriseTailoringFitting.create({
      data: {
        organizationId,
        reference: manufacturingReference("FIT"),
        productionOrderId: order.id,
        measurementProfileId,
        sequence: (latest?.sequence || 0) + 1,
        status: "SCHEDULED",
        result: "PENDING",
        scheduledAt: input.scheduledAt || null,
        fittedByEmployeeId: employee?.id || null,
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: order.id,
      eventType: "TAILORING_FITTING_SCHEDULED",
      summary: `Essayage ${fitting.reference} enregistré pour ${order.reference}.`,
      actorUserId,
      metadata: { fittingId: fitting.id, sequence: fitting.sequence, measurementProfileId },
    });
    return fitting;
  });
}

export async function completeTailoringFitting(organizationId: string, fittingId: string, actorUserId: string, input: FittingCompleteInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const fitting = await tx.enterpriseTailoringFitting.findFirst({ where: { id: fittingId, organizationId } });
    if (!fitting) throw new TailoringDomainError("Essayage introuvable.", 404, "TAILORING_FITTING_NOT_FOUND");
    if (fitting.revision !== input.revision) throw new TailoringConflictError();
    if (fitting.status !== "SCHEDULED") throw new TailoringDomainError("Seul un essayage planifié peut être clôturé ou annulé.", 409, "TAILORING_FITTING_STATUS_INVALID");
    const employee = await requireTailoringEmployee(tx, organizationId, input.fittedByEmployeeId || fitting.fittedByEmployeeId);
    const updated = await tx.enterpriseTailoringFitting.update({
      where: { id: fitting.id },
      data: {
        status: input.status,
        result: input.status === "CANCELLED" ? "PENDING" : input.result,
        fittedByEmployeeId: employee?.id || null,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        notes: tailoringNullable(input.notes),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: fitting.productionOrderId,
      eventType: "TAILORING_FITTING_COMPLETED",
      summary: `Essayage ${fitting.reference} : ${updated.result}.`,
      actorUserId,
      metadata: { fittingId: fitting.id, status: updated.status, result: updated.result },
    });
    return updated;
  });
}

export async function createTailoringAlteration(organizationId: string, actorUserId: string, input: AlterationInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const fitting = await tx.enterpriseTailoringFitting.findFirst({ where: { id: input.fittingId, organizationId } });
    if (!fitting) throw new TailoringDomainError("Essayage introuvable.", 404, "TAILORING_FITTING_NOT_FOUND");
    if (fitting.status !== "COMPLETED" || fitting.result !== "ADJUSTMENTS_REQUIRED") {
      throw new TailoringDomainError("Une retouche peut être créée uniquement après un essayage terminé avec ajustements requis.", 409, "TAILORING_ALTERATION_FITTING_REQUIRED");
    }
    const employee = await requireTailoringEmployee(tx, organizationId, input.assignedEmployeeId);
    const alteration = await tx.enterpriseTailoringAlteration.create({
      data: {
        organizationId,
        fittingId: fitting.id,
        productionOrderId: fitting.productionOrderId,
        alterationType: input.alterationType,
        areaCode: input.areaCode || null,
        priority: input.priority,
        status: "OPEN",
        assignedEmployeeId: employee?.id || null,
        dueAt: input.dueAt || null,
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
      },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: fitting.productionOrderId,
      eventType: "TAILORING_ALTERATION_CREATED",
      summary: `Retouche ${alteration.alterationType} créée après ${fitting.reference}.`,
      actorUserId,
      metadata: { alterationId: alteration.id, fittingId: fitting.id, assignedEmployeeId: employee?.id || null },
    });
    return alteration;
  });
}

export async function updateTailoringAlteration(organizationId: string, alterationId: string, actorUserId: string, input: AlterationUpdateInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const alteration = await tx.enterpriseTailoringAlteration.findFirst({ where: { id: alterationId, organizationId } });
    if (!alteration) throw new TailoringDomainError("Retouche introuvable.", 404, "TAILORING_ALTERATION_NOT_FOUND");
    if (alteration.revision !== input.revision) throw new TailoringConflictError();
    assertTransition(alteration.status, input.status, ALTERATION_TRANSITIONS, "TAILORING_ALTERATION_TRANSITION_INVALID");
    const employee = await requireTailoringEmployee(tx, organizationId, input.assignedEmployeeId || alteration.assignedEmployeeId);
    return tx.enterpriseTailoringAlteration.update({
      where: { id: alteration.id },
      data: {
        status: input.status,
        assignedEmployeeId: employee?.id || null,
        dueAt: input.dueAt || null,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        notes: tailoringNullable(input.notes),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
  });
}

export async function createTailoringGarmentBundle(organizationId: string, actorUserId: string, input: GarmentBundleInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const order = await requireTailoringProductionOrder(tx, organizationId, input.productionOrderId);
    const workCenter = await requireTailoringWorkCenter(tx, organizationId, input.currentWorkCenterId);
    let cuttingPlanId: string | null = null;
    if (input.cuttingPlanId) {
      const cuttingPlan = await tx.enterpriseTailoringCuttingPlan.findFirst({ where: { id: input.cuttingPlanId, organizationId, productionOrderId: order.id, status: "COMPLETED" } });
      if (!cuttingPlan) throw new TailoringDomainError("Le lot ne peut être créé qu’à partir d’un plan de coupe terminé du même ordre.", 409, "TAILORING_BUNDLE_CUTTING_PLAN_INVALID");
      cuttingPlanId = cuttingPlan.id;
    }
    const bundle = await tx.enterpriseTailoringGarmentBundle.create({
      data: {
        organizationId,
        bundleCode: manufacturingReference("GAR"),
        productionOrderId: order.id,
        cuttingPlanId,
        sizeCode: tailoringNullable(input.sizeCode)?.toUpperCase() || null,
        quantity: tailoringDecimal(input.quantity),
        status: "CUT",
        currentWorkCenterId: workCenter?.id || null,
        notes: tailoringNullable(input.notes),
        createdByUserId: actorUserId,
      },
    });
    return bundle;
  });
}

export async function updateTailoringGarmentBundle(organizationId: string, bundleId: string, actorUserId: string, input: GarmentBundleUpdateInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const bundle = await tx.enterpriseTailoringGarmentBundle.findFirst({ where: { id: bundleId, organizationId } });
    if (!bundle) throw new TailoringDomainError("Lot de vêtements introuvable.", 404, "TAILORING_BUNDLE_NOT_FOUND");
    if (bundle.revision !== input.revision) throw new TailoringConflictError();
    assertTransition(bundle.status, input.status, BUNDLE_TRANSITIONS, "TAILORING_BUNDLE_TRANSITION_INVALID");
    if (input.status === "READY_FOR_DELIVERY") {
      const finishing = await tx.enterpriseTailoringFinishingRecord.findFirst({ where: { organizationId, garmentBundleId: bundle.id, status: "READY" }, select: { id: true } });
      if (!finishing) throw new TailoringDomainError("Terminez la finition et le contrôle qualité avant de déclarer ce lot prêt pour livraison.", 409, "TAILORING_FINISHING_REQUIRED");
    }
    const workCenter = await requireTailoringWorkCenter(tx, organizationId, input.currentWorkCenterId);
    return tx.enterpriseTailoringGarmentBundle.update({
      where: { id: bundle.id },
      data: {
        status: input.status,
        currentWorkCenterId: workCenter?.id || null,
        notes: tailoringNullable(input.notes),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
  });
}

export async function upsertTailoringFinishing(organizationId: string, actorUserId: string, input: FinishingInput) {
  return withTailoringSerializable(async (tx) => {
    await requireActor(tx, organizationId, actorUserId);
    const order = await requireTailoringProductionOrder(tx, organizationId, input.productionOrderId);
    const bundle = await tx.enterpriseTailoringGarmentBundle.findFirst({ where: { id: input.garmentBundleId, organizationId, productionOrderId: order.id } });
    if (!bundle) throw new TailoringDomainError("Le lot de vêtements ne correspond pas à cet ordre de production.", 400, "TAILORING_FINISHING_BUNDLE_INVALID");
    const employee = await requireTailoringEmployee(tx, organizationId, input.completedByEmployeeId);
    const qualityCheck = await requireTailoringQualityCheck(tx, organizationId, order.id, input.qualityCheckId);
    if (input.status === "READY") {
      if (!input.pressed || !input.threadTrimmed || !input.fasteningsChecked || !input.packaged) {
        throw new TailoringDomainError("Tous les contrôles de finition doivent être cochés avant de déclarer le vêtement prêt.", 409, "TAILORING_FINISHING_CHECKLIST_INCOMPLETE");
      }
      if (!qualityCheck || qualityCheck.result !== "PASS") {
        throw new TailoringDomainError("Un contrôle qualité Manufacturing conforme est obligatoire avant la préparation de livraison.", 409, "TAILORING_FINISHING_QUALITY_REQUIRED");
      }
    }
    const existing = await tx.enterpriseTailoringFinishingRecord.findUnique({
      where: { organizationId_garmentBundleId: { organizationId, garmentBundleId: bundle.id } },
    });
    if (existing && (!input.revision || existing.revision !== input.revision)) throw new TailoringConflictError();
    const finishing = existing
      ? await tx.enterpriseTailoringFinishingRecord.update({
          where: { id: existing.id },
          data: {
            productionOrderId: order.id,
            qualityCheckId: qualityCheck?.id || null,
            status: input.status,
            pressed: input.pressed,
            threadTrimmed: input.threadTrimmed,
            fasteningsChecked: input.fasteningsChecked,
            packaged: input.packaged,
            completedByEmployeeId: employee?.id || null,
            completedAt: input.status === "READY" ? new Date() : null,
            notes: tailoringNullable(input.notes),
            updatedByUserId: actorUserId,
            revision: { increment: 1 },
          },
        })
      : await tx.enterpriseTailoringFinishingRecord.create({
          data: {
            organizationId,
            productionOrderId: order.id,
            garmentBundleId: bundle.id,
            qualityCheckId: qualityCheck?.id || null,
            status: input.status,
            pressed: input.pressed,
            threadTrimmed: input.threadTrimmed,
            fasteningsChecked: input.fasteningsChecked,
            packaged: input.packaged,
            completedByEmployeeId: employee?.id || null,
            completedAt: input.status === "READY" ? new Date() : null,
            notes: tailoringNullable(input.notes),
            createdByUserId: actorUserId,
          },
        });
    if (input.status === "READY") {
      await tx.enterpriseTailoringGarmentBundle.update({
        where: { id: bundle.id },
        data: { status: "READY_FOR_DELIVERY", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
    } else if (bundle.status === "CUT" || bundle.status === "SEWING" || bundle.status === "FITTING" || bundle.status === "ALTERATION") {
      await tx.enterpriseTailoringGarmentBundle.update({
        where: { id: bundle.id },
        data: { status: "FINISHING", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
    }
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: order.id,
      eventType: "TAILORING_FINISHING_UPDATED",
      summary: `Finition du lot ${bundle.bundleCode} : ${finishing.status}.`,
      actorUserId,
      metadata: { finishingId: finishing.id, garmentBundleId: bundle.id, qualityCheckId: qualityCheck?.id || null },
    });
    return finishing;
  });
}
