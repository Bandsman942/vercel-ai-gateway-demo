import type { Prisma } from "@prisma/client";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getActiveEnterpriseModuleRestriction } from "@/lib/enterprise/module-access-restrictions";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleBusinessSubtypeCompatible,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleNavigable,
  isEnterpriseModuleSectorCompatible,
  listEnterpriseModuleDefinitions,
  normalizeEnterpriseModuleCode,
  type EnterpriseModuleDefinition,
} from "@/lib/enterprise/module-registry";
import { compareEnterpriseModuleDefinitions } from "@/lib/enterprise/module-order";
import { prisma } from "@/lib/prisma";

export type EnterpriseModuleAction = "read" | "submit" | "write" | "approve" | "manage";

export type EnterpriseModuleAccessCode =
  | "OK"
  | "UNKNOWN_MODULE"
  | "MODULE_NOT_IMPLEMENTED"
  | "NO_ACTIVE_MEMBERSHIP"
  | "ORGANIZATION_INACTIVE"
  | "ORGANIZATION_NOT_CLIENT"
  | "SECTOR_INCOMPATIBLE"
  | "BUSINESS_SUBTYPE_INCOMPATIBLE"
  | "TENANT_MODULE_MISSING"
  | "TENANT_MODULE_DISABLED"
  | "DEPENDENCY_INACTIVE"
  | "ENTITLEMENT_DENIED"
  | "PERMISSION_DENIED";

export type EnterpriseModuleAccessDecision = {
  allowed: boolean;
  code: EnterpriseModuleAccessCode;
  message: string;
  canonicalCode: string | null;
  definition: EnterpriseModuleDefinition | null;
  tenantModuleId: string | null;
  tenantModuleCode: string | null;
  dependencyCode?: string;
};

export type EnterpriseModuleCapabilities = {
  canonicalCode: string | null;
  definition: EnterpriseModuleDefinition | null;
  canRead: boolean;
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};

export type EnterpriseModuleConfigurationIssue = {
  code: string;
  severity: "WARNING" | "ERROR";
  moduleCode?: string;
  moduleLabel?: string;
  dependencyCodes?: string[];
  message: string;
};

type EnterpriseAccessSnapshot = {
  userId: string;
  organizationId: string;
  sectorCode: string | null;
  businessSubtypeCode: string | null;
  role: string;
  permissions: string[];
  organizationSettings: Prisma.JsonValue | null;
  enabledCanonicalCodes: Set<string>;
  tenantModuleByCanonicalCode: Map<string, { id: string; moduleCode: string; isEnabled: boolean }>;
  entitlementByCanonicalCode: Map<string, { allowed: boolean; message: string }>;
};

const ENTERPRISE_ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);

function denied(
  code: EnterpriseModuleAccessCode,
  message: string,
  definition: EnterpriseModuleDefinition | null,
  tenantModule?: { id: string; moduleCode: string } | null,
  dependencyCode?: string,
): EnterpriseModuleAccessDecision {
  return {
    allowed: false,
    code,
    message,
    canonicalCode: definition?.code || null,
    definition,
    tenantModuleId: tenantModule?.id || null,
    tenantModuleCode: tenantModule?.moduleCode || null,
    dependencyCode,
  };
}

function permissionList(value: Prisma.JsonValue | null | undefined) {
  if (Array.isArray(value)) return value.filter((permission): permission is string => typeof permission === "string");
  if (value && typeof value === "object") {
    const possiblePermissions = (value as Record<string, unknown>).permissions;
    if (Array.isArray(possiblePermissions)) {
      return possiblePermissions.filter((permission): permission is string => typeof permission === "string");
    }
  }
  return [];
}

function permissionMatchesAction(permission: string, action: EnterpriseModuleAction) {
  if (action === "read") return permission.endsWith(".view") || permission.endsWith(".read") || permission.endsWith(".chat") || permission.includes(".view_");
  if (action === "submit") return permission.endsWith(".create") || permission.endsWith(".submit") || permission.endsWith(".chat") || permission.endsWith(".dispense");
  if (action === "write") return permission.endsWith(".create") || permission.endsWith(".update") || permission.endsWith(".validate") || permission.endsWith(".manage") || permission.endsWith(".dispense");
  if (action === "approve") return permission.endsWith(".approve") || permission.endsWith(".validate") || permission.endsWith(".manage");
  return permission.endsWith(".manage") || permission.endsWith(".admin");
}

function roleAllowsAction(role: string, action: EnterpriseModuleAction) {
  if (ENTERPRISE_ADMIN_ROLES.has(role)) return true;
  if (role === "MANAGER") return action !== "manage";
  if (role === "MEMBER") return action === "read" || action === "submit";
  if (role === "GUEST") return action === "read";
  return action === "read" || action === "submit";
}

function permissionsAllowAction(definition: EnterpriseModuleDefinition, permissions: string[], action: EnterpriseModuleAction) {
  if (permissions.includes("enterprise.admin.manage")) return true;
  if (!definition.permissionPrefixes.length) return definition.accessPolicy === "MEMBERSHIP";
  return permissions
    .filter((permission) => definition.permissionPrefixes.some((prefix) => permission.startsWith(prefix)))
    .some((permission) => permissionMatchesAction(permission, action));
}

async function getEnterpriseAccessSnapshot(userId: string, organizationId: string): Promise<EnterpriseAccessSnapshot | null> {
  const [membership, tenantModules, entitlements, subtypeSelection] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: { userId, organizationId, status: "ACTIVE", removedAt: null },
      select: {
        id: true,
        role: true,
        positionId: true,
        positionCode: true,
        organizationRoleAssignments: {
          where: { revokedAt: null, role: { isActive: true, archivedAt: null } },
          select: { role: { select: { permissionsJson: true, modulesJson: true, code: true } } },
        },
        organization: { select: { id: true, status: true, deletedAt: true, organizationType: true, sectorCode: true, settingsJson: true } },
      },
    }),
    prisma.enterpriseModule.findMany({
      where: { organizationId },
      select: { id: true, moduleCode: true, isEnabled: true },
    }),
    getOrganizationEntitlements(organizationId),
    prisma.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    }),
  ]);

  if (!membership || membership.organization.deletedAt || membership.organization.status !== "ACTIVE" || membership.organization.organizationType !== "CLIENT") {
    return null;
  }

  const position = membership.positionId || membership.positionCode
    ? await prisma.enterprisePosition.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [
            ...(membership.positionId ? [{ id: membership.positionId }] : []),
            ...(membership.positionCode ? [{ positionCode: membership.positionCode }] : []),
          ],
        },
        select: { permissionsJson: true },
      })
    : null;

  const tenantModuleByCanonicalCode = new Map<string, { id: string; moduleCode: string; isEnabled: boolean }>();
  const enabledCanonicalCodes = new Set<string>();
  for (const tenantModule of tenantModules) {
    const canonicalCode = normalizeEnterpriseModuleCode(tenantModule.moduleCode);
    const current = tenantModuleByCanonicalCode.get(canonicalCode);
    if (!current || tenantModule.moduleCode === canonicalCode) tenantModuleByCanonicalCode.set(canonicalCode, tenantModule);
    if (tenantModule.isEnabled) enabledCanonicalCodes.add(canonicalCode);
  }

  const entitlementByCanonicalCode = new Map<string, { allowed: boolean; message: string }>();
  for (const entitlement of entitlements?.modules || []) {
    const canonicalCode = normalizeEnterpriseModuleCode(entitlement.moduleCode);
    const current = entitlementByCanonicalCode.get(canonicalCode);
    if (!current || entitlement.moduleCode === canonicalCode) {
      entitlementByCanonicalCode.set(canonicalCode, { allowed: entitlement.allowed, message: entitlement.message });
    }
  }

  const inheritedRolePermissions = membership.organizationRoleAssignments.flatMap((assignment) => permissionList(assignment.role.permissionsJson));
  const permissions = Array.from(new Set([...permissionList(position?.permissionsJson), ...inheritedRolePermissions]));
  const businessSubtypeCode = subtypeSelection?.sectorCode === membership.organization.sectorCode
    ? subtypeSelection.businessSubtypeCode
    : null;

  return {
    userId,
    organizationId,
    sectorCode: membership.organization.sectorCode,
    businessSubtypeCode,
    role: membership.role,
    permissions,
    organizationSettings: membership.organization.settingsJson,
    enabledCanonicalCodes,
    tenantModuleByCanonicalCode,
    entitlementByCanonicalCode,
  };
}

function resolveFromSnapshot(snapshot: EnterpriseAccessSnapshot, moduleCode: string, action: EnterpriseModuleAction): EnterpriseModuleAccessDecision {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition) return denied("UNKNOWN_MODULE", "Ce service n’existe pas dans le catalogue DTSC.", null);
  if (!isEnterpriseModuleImplemented(definition.code)) return denied("MODULE_NOT_IMPLEMENTED", "Ce service n’est pas encore disponible.", definition);
  if (!isEnterpriseModuleSectorCompatible(definition, snapshot.sectorCode)) return denied("SECTOR_INCOMPATIBLE", "Ce service ne correspond pas au secteur de l’entreprise.", definition);
  if (!isEnterpriseModuleBusinessSubtypeCompatible(definition, snapshot.businessSubtypeCode)) return denied("BUSINESS_SUBTYPE_INCOMPATIBLE", "Ce service est réservé au sous-secteur configuré pour l’entreprise.", definition);
  if (definition.accessPolicy === "EXPLICIT_DENY") return denied("MODULE_NOT_IMPLEMENTED", "Ce service n’est pas proposé dans cet espace.", definition);

  if (definition.routeKind === "ADMIN_SECTION" || definition.accessPolicy === "ADMIN_ONLY") {
    const adminAllowed = ENTERPRISE_ADMIN_ROLES.has(snapshot.role) || snapshot.permissions.includes("enterprise.admin.manage") || snapshot.permissions.includes("enterprise.admin.members.manage");
    if (!adminAllowed) return denied("PERMISSION_DENIED", "Une autorisation d’administration est nécessaire.", definition);
    return { allowed: true, code: "OK", message: "Accès autorisé.", canonicalCode: definition.code, definition, tenantModuleId: null, tenantModuleCode: null };
  }

  const tenantModule = snapshot.tenantModuleByCanonicalCode.get(definition.code) || null;
  if (!tenantModule) return denied("TENANT_MODULE_MISSING", "Ce service n’est pas encore configuré pour l’entreprise.", definition);
  if (!tenantModule.isEnabled) return denied("TENANT_MODULE_DISABLED", "Ce service n’est pas activé dans l’abonnement de l’entreprise.", definition, tenantModule);

  const temporaryRestriction = getActiveEnterpriseModuleRestriction(snapshot.organizationSettings, snapshot.userId, definition.code);
  if (temporaryRestriction) {
    const until = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(temporaryRestriction.blockedUntil));
    return denied(
      "PERMISSION_DENIED",
      `Votre accès à ce service est temporairement suspendu jusqu’au ${until}. ${temporaryRestriction.reason}`,
      definition,
      tenantModule,
    );
  }

  for (const dependencyCode of definition.dependencies) {
    const canonicalDependency = normalizeEnterpriseModuleCode(dependencyCode);
    if (!snapshot.enabledCanonicalCodes.has(canonicalDependency)) {
      const dependency = getEnterpriseModuleDefinition(canonicalDependency);
      return denied(
        "DEPENDENCY_INACTIVE",
        `${dependency?.labelFr || "Un service préalable"} doit être activé avant d’ouvrir ${definition.labelFr}.`,
        definition,
        tenantModule,
        canonicalDependency,
      );
    }
  }

  const entitlement = snapshot.entitlementByCanonicalCode.get(definition.code);
  if (!entitlement?.allowed) return denied("ENTITLEMENT_DENIED", entitlement?.message || "L’abonnement actuel ne comprend pas ce service.", definition, tenantModule);

  if (ENTERPRISE_ADMIN_ROLES.has(snapshot.role)) {
    return { allowed: true, code: "OK", message: "Accès autorisé.", canonicalCode: definition.code, definition, tenantModuleId: tenantModule.id, tenantModuleCode: tenantModule.moduleCode };
  }

  const allowed = snapshot.permissions.length ? permissionsAllowAction(definition, snapshot.permissions, action) : roleAllowsAction(snapshot.role, action);
  if (!allowed) return denied("PERMISSION_DENIED", "Votre fonction ne vous autorise pas à réaliser cette action.", definition, tenantModule);

  return { allowed: true, code: "OK", message: "Accès autorisé.", canonicalCode: definition.code, definition, tenantModuleId: tenantModule.id, tenantModuleCode: tenantModule.moduleCode };
}

export async function resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action = "read" }: { userId: string; organizationId: string; moduleCode: string; action?: EnterpriseModuleAction }) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition) return denied("UNKNOWN_MODULE", "Ce service n’existe pas dans le catalogue DTSC.", null);
  const snapshot = await getEnterpriseAccessSnapshot(userId, organizationId);
  if (!snapshot) return denied("NO_ACTIVE_MEMBERSHIP", "Aucun accès actif à cette entreprise n’a été trouvé.", definition);
  return resolveFromSnapshot(snapshot, moduleCode, action);
}

export async function resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode }: { userId: string; organizationId: string; moduleCode: string }): Promise<EnterpriseModuleCapabilities> {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  const snapshot = definition ? await getEnterpriseAccessSnapshot(userId, organizationId) : null;
  if (!definition || !snapshot) {
    return { canonicalCode: definition?.code || null, definition: definition || null, canRead: false, canCreate: false, canSubmit: false, canWrite: false, canApprove: false, canManage: false };
  }
  const allowed = (action: EnterpriseModuleAction) => resolveFromSnapshot(snapshot, moduleCode, action).allowed;
  const canSubmit = allowed("submit");
  return {
    canonicalCode: definition.code,
    definition,
    canRead: allowed("read"),
    canCreate: canSubmit,
    canSubmit,
    canWrite: allowed("write"),
    canApprove: allowed("approve"),
    canManage: allowed("manage"),
  };
}

export async function listNavigableEnterpriseModules({ userId, organizationId, action = "read" }: { userId: string; organizationId: string; action?: EnterpriseModuleAction }) {
  const snapshot = await getEnterpriseAccessSnapshot(userId, organizationId);
  if (!snapshot) return [];
  const candidateCodes = new Set([
    ...snapshot.tenantModuleByCanonicalCode.keys(),
    ...listEnterpriseModuleDefinitions({ statuses: ["ACTIVE", "BETA"] })
      .filter((definition) => definition.accessPolicy === "ADMIN_ONLY" && isEnterpriseModuleNavigable(definition))
      .map((definition) => definition.code),
  ]);
  return Array.from(candidateCodes)
    .map((canonicalCode) => resolveFromSnapshot(snapshot, canonicalCode, action))
    .filter((decision) => decision.allowed && decision.definition && isEnterpriseModuleNavigable(decision.definition))
    .sort((left, right) => compareEnterpriseModuleDefinitions(left.definition as EnterpriseModuleDefinition, right.definition as EnterpriseModuleDefinition));
}

export async function listEnterpriseModuleConfigurationIssues(organizationId: string): Promise<EnterpriseModuleConfigurationIssue[]> {
  const [organization, subtypeSelection] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { sectorCode: true, enterpriseModules: { select: { id: true, moduleCode: true, isEnabled: true } } },
    }),
    prisma.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    }),
  ]);
  if (!organization) return [{ code: "ORGANIZATION_NOT_FOUND", severity: "ERROR", message: "L’entreprise sélectionnée est introuvable." }];
  const businessSubtypeCode = subtypeSelection?.sectorCode === organization.sectorCode ? subtypeSelection.businessSubtypeCode : null;

  const enabledCanonicalCodes = new Set(
    organization.enterpriseModules.filter((tenantModule) => tenantModule.isEnabled).map((tenantModule) => normalizeEnterpriseModuleCode(tenantModule.moduleCode)),
  );
  const canonicalRows = new Set(organization.enterpriseModules.map((tenantModule) => tenantModule.moduleCode));
  const issues: EnterpriseModuleConfigurationIssue[] = [];

  for (const tenantModule of organization.enterpriseModules) {
    const canonicalCode = normalizeEnterpriseModuleCode(tenantModule.moduleCode);
    const definition = getEnterpriseModuleDefinition(canonicalCode);
    if (!definition) {
      issues.push({
        code: "UNKNOWN_TENANT_MODULE",
        severity: tenantModule.isEnabled ? "ERROR" : "WARNING",
        moduleCode: tenantModule.moduleCode,
        moduleLabel: "Ancienne configuration de module",
        message: tenantModule.isEnabled
          ? "Une ancienne configuration est encore active et doit être archivée."
          : "Une ancienne configuration est conservée uniquement pour l’historique.",
      });
      continue;
    }

    if (tenantModule.moduleCode !== canonicalCode && canonicalRows.has(canonicalCode)) {
      issues.push({
        code: "DUPLICATE_ALIAS",
        severity: tenantModule.isEnabled ? "ERROR" : "WARNING",
        moduleCode: tenantModule.moduleCode,
        moduleLabel: definition.labelFr,
        message: "Un ancien nom de module fait doublon avec le service actuel. Il doit rester désactivé.",
      });
      continue;
    }

    if (tenantModule.isEnabled && !isEnterpriseModuleImplemented(definition.code)) {
      issues.push({ code: "ACTIVE_NOT_IMPLEMENTED", severity: "ERROR", moduleCode: canonicalCode, moduleLabel: definition.labelFr, message: "Ce service est activé alors qu’il n’est pas encore proposé aux utilisateurs." });
    }
    if (tenantModule.isEnabled && !isEnterpriseModuleSectorCompatible(definition, organization.sectorCode)) {
      issues.push({ code: "SECTOR_INCOMPATIBLE", severity: "ERROR", moduleCode: canonicalCode, moduleLabel: definition.labelFr, message: "Ce service ne correspond pas au secteur de l’entreprise sélectionnée." });
    }
    if (tenantModule.isEnabled && !isEnterpriseModuleBusinessSubtypeCompatible(definition, businessSubtypeCode)) {
      issues.push({ code: "BUSINESS_SUBTYPE_INCOMPATIBLE", severity: "ERROR", moduleCode: canonicalCode, moduleLabel: definition.labelFr, message: "Ce service ne correspond pas au sous-secteur configuré pour l’entreprise sélectionnée." });
    }

    const inactiveDependencies = definition.dependencies
      .map(normalizeEnterpriseModuleCode)
      .filter((dependencyCode) => tenantModule.isEnabled && !enabledCanonicalCodes.has(dependencyCode));
    if (inactiveDependencies.length) {
      const dependencyLabels = inactiveDependencies.map((dependencyCode) => getEnterpriseModuleDefinition(dependencyCode)?.labelFr || "Service préalable");
      issues.push({
        code: "DEPENDENCY_INACTIVE",
        severity: "ERROR",
        moduleCode: canonicalCode,
        moduleLabel: definition.labelFr,
        dependencyCodes: inactiveDependencies,
        message: `Services préalables à activer : ${dependencyLabels.join(", ")}.`,
      });
    }
  }

  return issues.sort((left, right) => (left.moduleLabel || left.moduleCode || "").localeCompare(right.moduleLabel || right.moduleCode || "", "fr"));
}