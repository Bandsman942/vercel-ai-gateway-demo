import type { AiProviderToolDefinition } from "@/lib/ai/types";
import { AI_TOOL_REGISTRY, type AiToolDefinition } from "@/lib/ai/tool-registry";
import { authorizeAiTool } from "@/lib/ai/tools/authorize";
import { ERP_AI_TOOL_DESCRIPTIONS } from "@/lib/ai/tools/erp-contract";
import { FINANCE_AI_TOOL_DESCRIPTIONS } from "@/lib/ai/tools/finance-contract";
import { MANUFACTURING_AI_TOOL_DESCRIPTIONS } from "@/lib/ai/tools/manufacturing-contract";
import { TAILORING_AI_TOOL_DESCRIPTIONS } from "@/lib/ai/tools/tailoring-contract";
import type { AiToolRuntimeContext } from "@/lib/ai/tools/types";
import type { AiAgentBudget } from "@/lib/ai/agent/types";

const TOOL_DESCRIPTIONS: Record<string, string> = {
  PHARMACY_DASHBOARD_READ: "Lire une synthèse opérationnelle actuelle de la pharmacie active.",
  PHARMACY_LOW_STOCK_READ: "Lire les produits actuellement en stock bas dans la pharmacie active.",
  PHARMACY_EXPIRY_READ: "Lire les lots proches de la péremption dans la pharmacie active.",
  PHARMACY_OPEN_ALERTS_READ: "Lire les alertes pharmacie actuellement ouvertes.",
  PHARMACY_TODAY_SALES_READ: "Lire la synthèse des ventes du jour de la pharmacie active.",
  PHARMACY_CASH_SESSIONS_READ: "Lire les sessions de caisse de la pharmacie active.",
  PHARMACY_OPEN_PURCHASES_READ: "Lire les commandes ou achats pharmacie encore ouverts.",
  PHARMACY_QUALITY_INCIDENTS_READ: "Lire les incidents qualité/pharmacovigilance autorisés de la pharmacie active.",
  PHARMACY_DOCUMENTS_SUMMARY_READ: "Lire une synthèse des documents et éléments de conformité pharmacie autorisés.",
  ...FINANCE_AI_TOOL_DESCRIPTIONS,
  ...ERP_AI_TOOL_DESCRIPTIONS,
  ...MANUFACTURING_AI_TOOL_DESCRIPTIONS,
  ...TAILORING_AI_TOOL_DESCRIPTIONS,
  TASK_DRAFT_PREPARE: "Préparer un brouillon de tâche DTSC sans créer la tâche finale.",
  SUPPORT_TICKET_CREATE: "Créer un ticket support DTSC uniquement après confirmation humaine structurelle.",
  DTSC_CONTACT_EMAIL_SEND: "Envoyer un message à DTSC uniquement après confirmation humaine structurelle.",
};

function definitionToProviderTool(definition: AiToolDefinition): AiProviderToolDefinition {
  return {
    code: definition.code,
    description: TOOL_DESCRIPTIONS[definition.code] || `Outil DTSC certifié ${definition.code}. ${definition.descriptionKey}`,
    inputSchema: definition.inputSchema,
  };
}

export async function listAuthorizedAgentTools(input: { context: AiToolRuntimeContext; budget: AiAgentBudget }) {
  const requestedCodes = input.budget.allowedToolCodes == null ? null : new Set(input.budget.allowedToolCodes);
  const allowedModes = new Set(input.budget.allowedToolModes);
  const authorized: Array<{ definition: AiToolDefinition; providerTool: AiProviderToolDefinition }> = [];

  for (const definition of AI_TOOL_REGISTRY) {
    if (!allowedModes.has(definition.mode)) continue;
    if (definition.mode === "SENSITIVE_MUTATE") continue;
    if (requestedCodes && !requestedCodes.has(definition.code)) continue;
    const decision = await authorizeAiTool(definition.code, input.context);
    if (!decision.allowed) continue;
    authorized.push({ definition, providerTool: definitionToProviderTool(definition) });
  }

  return authorized;
}
