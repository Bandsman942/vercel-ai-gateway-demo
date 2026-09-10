import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { parseInitialAdminInvitation } from "@/lib/console/client-organization-create-invitation";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { applyCanonicalSectorTemplateToOrganization } from "@/lib/enterprise/sector-template-application";
import {
  getBusinessSubtypeForSector,
  normalizeBusinessSubtypeCode,
} from "@/lib/enterprise/business-subtype-registry";
import { persistBusinessSubtypeSelection } from "@/lib/enterprise/business-subtype-selection";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { syncRetailOnboardingProvisioning } from "@/lib/enterprise/retail/provisioning";
import { normalizeRetailBusinessSubtypeCode } from "@/lib/enterprise/retail/subtype-registry";
import { TAILORING_BUSINESS_SUBTYPE_CODE } from "@/lib/enterprise/tailoring/constants";
import { canManageClientOrganizations, isDtscInternalSession } from "@/lib/organizations";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseOrganizationCreateSchema } from "@/lib/validators";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "client_organization_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", reasonCode: "NOT_DTSC_INTERNAL" }, { status: 403 });
  }
  const capability = await requireConsoleCapability(CONSOLE_CAPABILITIES.ORGANIZATIONS_MANAGE);
  const legacyRoleRecognized = canManageClientOrganizations(session.role);
  if (!legacyRoleRecognized && capability.response) return capability.response;
  if (capability.response) return capability.response;
  const limited = await rateLimit(getRateLimitKey(req, `client-organization-create:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations organisations sur une courte période." }, { status: 429 });
  }

  const rawBody = await req.json().catch(() => null);
  const rawSubtype = rawBody && typeof rawBody === "object" && typeof (rawBody as Record<string, unknown>).businessSubtypeCode === "string"
    ? String((rawBody as Record<string, unknown>).businessSubtypeCode).trim()
    : "";

  const parsed = enterpriseOrganizationCreateSchema.safeParse(rawBody);
  const parsedAdminInvitation = parseInitialAdminInvitation(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = typeof firstIssue?.path?.[0] === "string" ? firstIssue.path[0] : null;
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { action: "client_organization_create_validation_failed", field } });
    return NextResponse.json({ error: "Invalid payload", reasonCode: "VALIDATION_ERROR", field, message: "Les informations de l'entreprise sont invalides." }, { status: 400 });
  }
  if (!parsedAdminInvitation.success) {
    const firstIssue = parsedAdminInvitation.error.issues[0];
    const field = typeof firstIssue?.path?.[0] === "string" ? firstIssue.path[0] : null;
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { action: "client_organization_admin_invitation_validation_failed", field } });
    return NextResponse.json({
      error: "Invalid administrator invitation",
      reasonCode: "VALIDATION_ERROR",
      field,
      message: field === "adminReason" ? "Renseignez une raison valide avant d'envoyer l'invitation administrateur." : "L'invitation administrateur contient une information invalide.",
    }, { status: 400 });
  }

  const data = parsed.data;
  const adminReason = parsedAdminInvitation.data.adminReason?.trim() || "";
  const slug = data.slug || slugify(data.name);
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Slug already exists", message: "Ce slug d'entreprise existe déjà." }, { status: 409 });
  }
  if (data.adminUserId) {
    const adminUser = await prisma.user.findFirst({ where: { id: data.adminUserId, status: "ACTIVE" }, select: { id: true } });
    if (!adminUser) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid admin", message: "L'administrateur entreprise sélectionné est introuvable ou inactif." }, { status: 400 });
    }
  }
  if (data.planId) {
    const plan = await prisma.billingPlan.findFirst({ where: { id: data.planId, isActive: true }, select: { id: true } });
    if (!plan) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid plan", message: "Le plan sélectionné est introuvable ou inactif." }, { status: 400 });
    }
  }
  const sector = data.sectorId
    ? await prisma.businessSector.findFirst({ where: { id: data.sectorId, isActive: true }, select: { id: true, code: true, labelFr: true } })
    : null;
  if (data.sectorId && !sector) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid sector", message: "Le secteur d'activité sélectionné est introuvable ou inactif." }, { status: 400 });
  }

  const normalizedSubtype = normalizeBusinessSubtypeCode(rawSubtype);
  const businessSubtype = rawSubtype && sector
    ? getBusinessSubtypeForSector(sector.code, rawSubtype)
    : null;
  if (rawSubtype && !businessSubtype) {
    const legacyRetailReasonCode = sector?.code === RETAIL_SECTOR_CODE
      ? "RETAIL_BUSINESS_SUBTYPE_INVALID"
      : normalizedSubtype === "SHOP"
        ? "RETAIL_BUSINESS_SUBTYPE_SECTOR_MISMATCH"
        : null;
    const reasonCode = legacyRetailReasonCode || "BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH";
    const message = legacyRetailReasonCode === "RETAIL_BUSINESS_SUBTYPE_INVALID"
      ? "Le sous-type Commerce retail sélectionné n’est pas disponible. Choisissez une option proposée par DTSC Platform."
      : legacyRetailReasonCode === "RETAIL_BUSINESS_SUBTYPE_SECTOR_MISMATCH"
        ? "Le sous-type Commerce retail ne peut être utilisé qu’avec le secteur Commerce retail."
        : "Le sous-secteur sélectionné n’est pas disponible pour ce secteur.";
    await writeApiLog({
      request: req,
      statusCode: 400,
      userId: session.userId,
      startedAt,
      metadata: {
        action: "client_organization_invalid_business_subtype",
        sectorCode: sector?.code || null,
        reasonCode,
      },
    });
    return NextResponse.json({
      error: "Invalid business subtype",
      reasonCode,
      field: "businessSubtypeCode",
      message,
    }, { status: 400 });
  }

  const businessSubtypeCode = businessSubtype?.code || null;
  const retailBusinessSubtypeCode = sector?.code === RETAIL_SECTOR_CODE
    ? normalizeRetailBusinessSubtypeCode(businessSubtypeCode)
    : null;

  const organization = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: data.name,
        slug,
        status: data.status,
        organizationType: "CLIENT",
        sectorId: sector?.id || null,
        sectorCode: sector?.code || null,
        sector: sector?.labelFr || data.industry || null,
        industry: sector?.labelFr || data.industry || null,
        country: data.country || null,
        city: data.city || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        timezone: data.timezone,
        notes: data.notes || null,
        createdByDtscUserId: session.userId,
      },
    });

    if (data.adminUserId) {
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: created.id, userId: data.adminUserId } },
        update: { role: "ADMIN_ENTREPRISE", status: "INVITED", removedAt: null, joinedAt: null, invitedBy: session.userId },
        create: {
          organizationId: created.id,
          userId: data.adminUserId,
          role: "ADMIN_ENTREPRISE",
          status: "INVITED",
          invitedBy: session.userId,
          joinedAt: null,
        },
      });
      await tx.organizationAdminGrant.create({
        data: {
          organizationId: created.id,
          userId: data.adminUserId,
          grantedByDtscUserId: session.userId,
          status: "PENDING",
          reason: adminReason,
        },
      });
    }

    if (data.planId) {
      await tx.organizationSubscription.create({
        data: {
          organizationId: created.id,
          planId: data.planId,
          status: "ACTIVE",
          startedAt: new Date(),
          createdByDtscUserId: session.userId,
          updatedByDtscUserId: session.userId,
        },
      });
    }

    if (sector) {
      await persistBusinessSubtypeSelection({
        organizationId: created.id,
        sectorCode: sector.code,
        businessSubtypeCode,
        actorUserId: session.userId,
        source: "DTSC_ADMIN",
      }, tx);
    }

    return created;
  });

  if (data.adminUserId) {
    await notifyUser({
      userId: data.adminUserId,
      title: `Invitation administrateur · ${organization.name}`,
      body: adminReason,
      type: "ENTERPRISE_INVITATION",
      targetUrl: `/enterprise-invitations?organizationId=${encodeURIComponent(organization.id)}`,
      organizationId: organization.id,
    }).catch(() => null);
  }

  const requiresCanonicalSectorTemplate = businessSubtypeCode === TAILORING_BUSINESS_SUBTYPE_CODE;
  if (sector && (data.applySectorTemplate || requiresCanonicalSectorTemplate)) {
    await applyCanonicalSectorTemplateToOrganization({
      organizationId: organization.id,
      sectorId: sector.id,
      actorUserId: session.userId,
      mode: "merge",
      businessSubtypeCode,
    });
  } else if (sector?.code === RETAIL_SECTOR_CODE) {
    // Retail keeps its historical settings mirror during the generic cutover.
    await syncRetailOnboardingProvisioning({
      organizationId: organization.id,
      sectorCode: sector.code,
      actorUserId: session.userId,
      businessSubtypeCode: retailBusinessSubtypeCode,
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "CLIENT_ORGANIZATION_CREATED",
    entity: "Organization",
    entityId: organization.id,
    reasonCode: capability.reasonCode,
    metadata: {
      adminInvitationPending: Boolean(data.adminUserId),
      adminInvitationReason: data.adminUserId ? adminReason : null,
      planId: data.planId || null,
      sectorId: sector?.id || null,
      sectorCode: sector?.code || null,
      businessSubtypeCode,
      sectorTemplateForcedBySubtype: requiresCanonicalSectorTemplate,
    },
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, organization, businessSubtypeCode }, { status: 201 });
}