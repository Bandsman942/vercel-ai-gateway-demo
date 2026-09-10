import type { SessionPayload } from "@/lib/session";
import { resolveEnterpriseModuleAccess, type EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";

export async function getTailoringAccess({
  session,
  organizationId,
  moduleCode,
  action = "read",
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: TailoringModuleCode;
  action?: EnterpriseModuleAction;
}) {
  const decision = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode,
    action,
  });
  if (!decision.allowed) return null;

  const [writeDecision, approveDecision, manageDecision] = await Promise.all([
    action === "write" || action === "manage"
      ? Promise.resolve(decision)
      : resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "write" }),
    action === "approve"
      ? Promise.resolve(decision)
      : resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "approve" }),
    action === "manage"
      ? Promise.resolve(decision)
      : resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "manage" }),
  ]);

  return {
    decision,
    canWrite: action === "write" || action === "manage" || writeDecision.allowed,
    canApprove: action === "approve" || approveDecision.allowed,
    canManage: action === "manage" || manageDecision.allowed,
  };
}
