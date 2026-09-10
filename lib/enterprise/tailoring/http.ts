import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTailoringAccess } from "@/lib/enterprise/tailoring/access";
import type { TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";
import { TailoringDomainError } from "@/lib/enterprise/tailoring/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function authorizeTailoringRequest({
  request,
  organizationId,
  moduleCode,
  action = "read",
  mutate = false,
}: {
  request: Request;
  organizationId: string;
  moduleCode: TailoringModuleCode;
  action?: "read" | "submit" | "write" | "approve" | "manage";
  mutate?: boolean;
}) {
  if (mutate && !isSameOriginRequest(request)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (mutate) {
    const limited = await rateLimit(
      getRateLimitKey(request, `enterprise-tailoring:${organizationId}:${session.userId}`),
      180,
      60 * 60 * 1000,
    );
    if (!limited.ok) return { ok: false as const, response: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }
  const access = await getTailoringAccess({ session, organizationId, moduleCode, action });
  if (!access) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const, session, access };
}

export function tailoringErrorResponse(error: unknown, fallbackCode = "TAILORING_OPERATION_FAILED") {
  if (error instanceof TailoringDomainError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.statusCode });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "TAILORING_DUPLICATE", message: "Une donnée atelier portant la même référence existe déjà." }, { status: 409 });
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "string" && /^[A-Z0-9_:-]+$/.test(record.code) ? record.code : null;
    const statusCode = typeof record.statusCode === "number" && record.statusCode >= 400 && record.statusCode < 500 ? record.statusCode : null;
    if (code && statusCode) {
      return NextResponse.json({ error: code, message: error instanceof Error ? error.message : "Cette opération n’est pas autorisée." }, { status: statusCode });
    }
  }
  const errorName = error instanceof Error ? error.name : typeof error;
  const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
  console.error("[tailoring] unexpected operation failure", { fallbackCode, errorName, prismaCode });
  return NextResponse.json({
    error: fallbackCode,
    message: "Le service Couture n’a pas pu terminer cette opération. Actualisez les données puis réessayez.",
  }, { status: 500 });
}
