import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import {
  TAILORING_MODULE_CODES,
  type TailoringModuleCode,
} from "@/lib/enterprise/tailoring/constants";
import { authorizeTailoringRequest, tailoringErrorResponse } from "@/lib/enterprise/tailoring/http";
import { getTailoringModuleData, getTailoringOverview, getTailoringReferences } from "@/lib/enterprise/tailoring/queries";
import {
  changeTailoringStyleStatus,
  completeTailoringFitting,
  createTailoringAlteration,
  createTailoringCuttingPlan,
  createTailoringFitting,
  createTailoringGarmentBundle,
  createTailoringMaterialProfile,
  createTailoringMeasurementProfile,
  createTailoringSizeGrade,
  createTailoringStyle,
  updateTailoringAlteration,
  updateTailoringConfiguration,
  updateTailoringCuttingPlan,
  updateTailoringGarmentBundle,
  upsertTailoringFinishing,
} from "@/lib/enterprise/tailoring/service";
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

type Params = { params: Promise<{ organizationId: string }> };
const TAILORING_MODULE_SET = new Set<string>(TAILORING_MODULE_CODES);

type CollectionAction =
  | "SAVE_CONFIGURATION"
  | "CREATE_MEASUREMENT_PROFILE"
  | "CREATE_STYLE"
  | "CHANGE_STYLE_STATUS"
  | "CREATE_SIZE_GRADE"
  | "CREATE_MATERIAL_PROFILE"
  | "CREATE_CUTTING_PLAN"
  | "UPDATE_CUTTING_PLAN"
  | "CREATE_FITTING"
  | "COMPLETE_FITTING"
  | "CREATE_ALTERATION"
  | "UPDATE_ALTERATION"
  | "CREATE_GARMENT_BUNDLE"
  | "UPDATE_GARMENT_BUNDLE"
  | "UPSERT_FINISHING";

function requestedModuleCode(request: Request): TailoringModuleCode {
  const requested = new URL(request.url).searchParams.get("moduleCode")?.trim().toUpperCase() || "TAILORING_OVERVIEW";
  return TAILORING_MODULE_SET.has(requested) ? requested as TailoringModuleCode : "TAILORING_OVERVIEW";
}

function payloadError(message: string) {
  return NextResponse.json({ error: "INVALID_PAYLOAD", message }, { status: 400 });
}

async function linkedAccess(userId: string, organizationId: string, moduleCode: string, action: "read" | "write" = "read") {
  return resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action });
}

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const moduleCode = requestedModuleCode(request);
  const authorization = await authorizeTailoringRequest({ request, organizationId, moduleCode, action: "read" });
  if (!authorization.ok) return authorization.response;

  try {
    const userId = authorization.session.userId;
    const [overview, moduleData, crmAccess, catalogAccess, ordersAccess, hrAccess, workCenterAccess, bomAccess, routingAccess, qualityAccess, measurementAccess] = await Promise.all([
      getTailoringOverview(organizationId),
      getTailoringModuleData(organizationId, moduleCode),
      linkedAccess(userId, organizationId, "CRM_CUSTOMERS"),
      linkedAccess(userId, organizationId, "CATALOG"),
      linkedAccess(userId, organizationId, "PRODUCTION_ORDERS"),
      linkedAccess(userId, organizationId, "HUMAN_RESOURCES"),
      linkedAccess(userId, organizationId, "WORK_CENTERS"),
      linkedAccess(userId, organizationId, "BILL_OF_MATERIALS"),
      linkedAccess(userId, organizationId, "PRODUCTION_ROUTINGS"),
      linkedAccess(userId, organizationId, "QUALITY_CONTROL"),
      linkedAccess(userId, organizationId, "TAILORING_MEASUREMENTS"),
    ]);
    const references = await getTailoringReferences(organizationId, {
      customers: crmAccess.allowed,
      catalog: catalogAccess.allowed,
      productionOrders: ordersAccess.allowed,
      employees: hrAccess.allowed,
      workCenters: workCenterAccess.allowed,
      boms: bomAccess.allowed,
      routings: routingAccess.allowed,
      qualityChecks: qualityAccess.allowed,
      measurements: measurementAccess.allowed,
    });

    await writeApiLog({ request, statusCode: 200, userId, startedAt, metadata: { organizationId, domain: "tailoring", moduleCode } });
    return NextResponse.json({
      moduleCode,
      capabilities: {
        canWrite: authorization.access.canWrite,
        canApprove: authorization.access.canApprove,
        canManage: authorization.access.canManage,
      },
      overview,
      references,
      ...moduleData,
    });
  } catch (error) {
    return tailoringErrorResponse(error, "TAILORING_READ_FAILED");
  }
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const body = await request.json().catch(() => null) as { action?: CollectionAction; payload?: unknown; entityId?: string } | null;
  if (!body?.action) return payloadError("Une action Couture valide est obligatoire.");

  const actionPolicy: Record<CollectionAction, { moduleCode: TailoringModuleCode; action: "write" | "manage" }> = {
    SAVE_CONFIGURATION: { moduleCode: "TAILORING_OVERVIEW", action: "manage" },
    CREATE_MEASUREMENT_PROFILE: { moduleCode: "TAILORING_MEASUREMENTS", action: "write" },
    CREATE_STYLE: { moduleCode: "TAILORING_STYLES_PATTERNS", action: "write" },
    CHANGE_STYLE_STATUS: { moduleCode: "TAILORING_STYLES_PATTERNS", action: "manage" },
    CREATE_SIZE_GRADE: { moduleCode: "TAILORING_SIZE_GRADING", action: "write" },
    CREATE_MATERIAL_PROFILE: { moduleCode: "TAILORING_MATERIAL_PROFILES", action: "write" },
    CREATE_CUTTING_PLAN: { moduleCode: "TAILORING_CUTTING_PLANS", action: "write" },
    UPDATE_CUTTING_PLAN: { moduleCode: "TAILORING_CUTTING_PLANS", action: "write" },
    CREATE_FITTING: { moduleCode: "TAILORING_FITTINGS", action: "write" },
    COMPLETE_FITTING: { moduleCode: "TAILORING_FITTINGS", action: "write" },
    CREATE_ALTERATION: { moduleCode: "TAILORING_ALTERATIONS", action: "write" },
    UPDATE_ALTERATION: { moduleCode: "TAILORING_ALTERATIONS", action: "write" },
    CREATE_GARMENT_BUNDLE: { moduleCode: "TAILORING_GARMENT_TRACKING", action: "write" },
    UPDATE_GARMENT_BUNDLE: { moduleCode: "TAILORING_GARMENT_TRACKING", action: "write" },
    UPSERT_FINISHING: { moduleCode: "TAILORING_FINISHING", action: "write" },
  };
  const policy = actionPolicy[body.action];
  const authorization = await authorizeTailoringRequest({ request, organizationId, moduleCode: policy.moduleCode, action: policy.action, mutate: true });
  if (!authorization.ok) return authorization.response;

  const requireLinked = async (moduleCode: string, action: "read" | "write" = "read") => {
    const decision = await linkedAccess(authorization.session.userId, organizationId, moduleCode, action);
    if (!decision.allowed) {
      throw Object.assign(new Error("Cette opération nécessite aussi l’accès au module lié."), { code: `${moduleCode}_ACCESS_DENIED`, statusCode: 403 });
    }
  };

  try {
    let result: unknown;
    if (body.action === "SAVE_CONFIGURATION") {
      const parsed = tailoringConfigurationSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Configuration atelier invalide.");
      result = await updateTailoringConfiguration(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_MEASUREMENT_PROFILE") {
      const parsed = tailoringMeasurementProfileCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Mensurations invalides.");
      await requireLinked("CRM_CUSTOMERS");
      if (parsed.data.measuredByEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await createTailoringMeasurementProfile(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_STYLE") {
      const parsed = tailoringStyleCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Style invalide.");
      await requireLinked("CATALOG");
      if (parsed.data.bomId) await requireLinked("BILL_OF_MATERIALS");
      if (parsed.data.routingId) await requireLinked("PRODUCTION_ROUTINGS");
      result = await createTailoringStyle(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CHANGE_STYLE_STATUS") {
      if (!body.entityId) return payloadError("Le style à modifier est obligatoire.");
      const parsed = tailoringDefinitionActionSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Action style invalide.");
      result = await changeTailoringStyleStatus(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_SIZE_GRADE") {
      const parsed = tailoringSizeGradeCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Gradation invalide.");
      await requireLinked("TAILORING_STYLES_PATTERNS");
      result = await createTailoringSizeGrade(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_MATERIAL_PROFILE") {
      const parsed = tailoringMaterialProfileSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Profil matière invalide.");
      await Promise.all([requireLinked("CATALOG"), requireLinked("INVENTORY_LOGISTICS")]);
      result = await createTailoringMaterialProfile(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_CUTTING_PLAN") {
      const parsed = tailoringCuttingPlanCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Plan de coupe invalide.");
      await Promise.all([requireLinked("PRODUCTION_ORDERS"), requireLinked("MATERIAL_REQUIREMENTS"), requireLinked("CATALOG"), requireLinked("INVENTORY_LOGISTICS")]);
      result = await createTailoringCuttingPlan(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "UPDATE_CUTTING_PLAN") {
      if (!body.entityId) return payloadError("Le plan de coupe à modifier est obligatoire.");
      const parsed = tailoringCuttingPlanUpdateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Mise à jour de coupe invalide.");
      result = await updateTailoringCuttingPlan(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_FITTING") {
      const parsed = tailoringFittingCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Essayage invalide.");
      await requireLinked("PRODUCTION_ORDERS");
      if (parsed.data.measurementProfileId) await requireLinked("TAILORING_MEASUREMENTS");
      if (parsed.data.fittedByEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await createTailoringFitting(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "COMPLETE_FITTING") {
      if (!body.entityId) return payloadError("L’essayage à modifier est obligatoire.");
      const parsed = tailoringFittingCompleteSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Résultat d’essayage invalide.");
      if (parsed.data.fittedByEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await completeTailoringFitting(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_ALTERATION") {
      const parsed = tailoringAlterationCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Retouche invalide.");
      await requireLinked("TAILORING_FITTINGS");
      if (parsed.data.assignedEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await createTailoringAlteration(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "UPDATE_ALTERATION") {
      if (!body.entityId) return payloadError("La retouche à modifier est obligatoire.");
      const parsed = tailoringAlterationUpdateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Mise à jour de retouche invalide.");
      if (parsed.data.assignedEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await updateTailoringAlteration(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_GARMENT_BUNDLE") {
      const parsed = tailoringGarmentBundleCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Lot de vêtements invalide.");
      await requireLinked("PRODUCTION_ORDERS");
      if (parsed.data.cuttingPlanId) await requireLinked("TAILORING_CUTTING_PLANS");
      if (parsed.data.currentWorkCenterId) await requireLinked("WORK_CENTERS");
      result = await createTailoringGarmentBundle(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "UPDATE_GARMENT_BUNDLE") {
      if (!body.entityId) return payloadError("Le lot de vêtements à modifier est obligatoire.");
      const parsed = tailoringGarmentBundleUpdateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Mise à jour du lot invalide.");
      if (parsed.data.currentWorkCenterId) await requireLinked("WORK_CENTERS");
      result = await updateTailoringGarmentBundle(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else {
      const parsed = tailoringFinishingSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Finition invalide.");
      await Promise.all([requireLinked("TAILORING_GARMENT_TRACKING"), requireLinked("QUALITY_CONTROL")]);
      if (parsed.data.completedByEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await upsertTailoringFinishing(organizationId, authorization.session.userId, parsed.data);
    }

    await writeAuditLog({
      userId: authorization.session.userId,
      action: `TAILORING_${body.action}`,
      entity: "Tailoring",
      entityId: body.entityId || organizationId,
      request,
      metadata: { organizationId, moduleCode: policy.moduleCode },
    });
    await writeApiLog({ request, statusCode: 200, userId: authorization.session.userId, startedAt, metadata: { organizationId, domain: "tailoring", action: body.action } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return tailoringErrorResponse(error);
  }
}
