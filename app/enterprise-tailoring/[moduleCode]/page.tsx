import { notFound, redirect } from "next/navigation";
import { EnterpriseTailoringWorkspace } from "@/components/enterprise/tailoring/enterprise-tailoring-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { normalizeEnterpriseModuleCode, resolveEnterpriseModuleRoute } from "@/lib/enterprise/module-registry";
import { TAILORING_MODULE_CODES, type TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ moduleCode: string }> };
const TAILORING_MODULE_SET = new Set<string>(TAILORING_MODULE_CODES);

export default async function EnterpriseTailoringPage({ params }: Params) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const { moduleCode: requestedModuleCode } = await params;
  const canonicalModuleCode = normalizeEnterpriseModuleCode(requestedModuleCode);
  if (!TAILORING_MODULE_SET.has(canonicalModuleCode)) notFound();

  const route = resolveEnterpriseModuleRoute(canonicalModuleCode);
  if (!route || route.definition.workspaceKey !== "ENTERPRISE_TAILORING" || !route.path.startsWith("/enterprise-tailoring/")) notFound();

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: user.id,
    organizationId,
    moduleCode: canonicalModuleCode,
  });
  if (!capabilities.canRead || !capabilities.definition) notFound();

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "MANUFACTURING" },
    select: { name: true },
  });
  if (!organization) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseTailoringWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        definition={capabilities.definition}
        initialFocus={canonicalModuleCode as TailoringModuleCode}
        locale={user.locale}
      />
    </AppShell>
  );
}
