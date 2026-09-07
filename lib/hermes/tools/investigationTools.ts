/**
 * The controlled investigation tool set (task section 9). Every tool here
 * is read-only — none of them can close an account, file a SAR, move
 * funds, deny a customer, release funds, or change any policy/threshold/
 * rule/model, matching the project's Critical Rule (CLAUDE.md) and this
 * branch's own strict governance rule. They exist so a Hermes-side flow
 * (or, later, a real MCP client) has one well-audited path to the same
 * data an analyst already sees, instead of reaching into Supabase or
 * OrchestrationStore directly.
 */
import type { AgentMemory, AgentSkill } from "../types.js";
import type { Alert, CaseEvent, Customer, MlPrediction, RiskSignal, Transaction } from "../../supabase/types.js";
import { scopeToOrg, toolError, toolOk, type ToolDefinition, type ToolResult } from "./types.js";

export const getCustomerTool: ToolDefinition<{ customerId: string }, Customer> = {
  name: "get_customer",
  description: "Retrieve a customer's profile record by id, scoped to the caller's organization.",
  async execute(deps, ctx, input) {
    const customer = scopeToOrg(await deps.orchestrationStore.getCustomer(input.customerId), ctx.organizationId);
    return customer ? toolOk(customer) : toolError("Customer not found");
  },
};

export const getTransactionsTool: ToolDefinition<
  { customerId: string; beforeIso?: string; limit?: number },
  Transaction[]
> = {
  name: "get_transactions",
  description: "Retrieve a customer's recent transaction history, scoped to the caller's organization.",
  async execute(deps, ctx, input) {
    const customer = scopeToOrg(await deps.orchestrationStore.getCustomer(input.customerId), ctx.organizationId);
    if (!customer) return toolError("Customer not found");
    const transactions = await deps.orchestrationStore.getRecentTransactions(
      input.customerId,
      input.beforeIso ?? new Date().toISOString(),
      Math.min(input.limit ?? 50, 200)
    );
    return toolOk(transactions);
  },
};

export const getAlertTool: ToolDefinition<{ alertId: string }, Alert> = {
  name: "get_alert",
  description: "Retrieve an alert by id, scoped to the caller's organization.",
  async execute(deps, ctx, input) {
    const alert = scopeToOrg(await deps.orchestrationStore.getAlert(input.alertId), ctx.organizationId);
    return alert ? toolOk(alert) : toolError("Alert not found");
  },
};

export interface EvidenceSummary {
  disposition: string;
  riskLevel: string;
  rationale: string;
  redFlags: unknown;
  supportingEvidence: unknown;
  contradictoryEvidence: unknown;
  recommendedNextSteps: unknown;
}

export const getEvidenceTool: ToolDefinition<{ alertId: string }, EvidenceSummary> = {
  name: "get_evidence",
  description:
    "Retrieve the evidence recorded against the AI recommendation for an alert (supporting/contradictory " +
    "evidence, red flags, rationale) — the persisted record of what the investigation actually considered, " +
    "not a re-run of evidence collection.",
  async execute(deps, ctx, input) {
    const alert = scopeToOrg(await deps.orchestrationStore.getAlert(input.alertId), ctx.organizationId);
    if (!alert) return toolError("Alert not found");
    const recommendation = await deps.orchestrationStore.findRecommendationByAlertId(input.alertId);
    if (!recommendation || recommendation.organization_id !== ctx.organizationId) {
      return toolError("No recommendation/evidence recorded for this alert yet");
    }
    return toolOk({
      disposition: recommendation.disposition,
      riskLevel: recommendation.risk_level,
      rationale: recommendation.rationale,
      redFlags: recommendation.red_flags,
      supportingEvidence: recommendation.supporting_evidence,
      contradictoryEvidence: recommendation.contradictory_evidence,
      recommendedNextSteps: recommendation.recommended_next_steps,
    });
  },
};

export const getRiskSignalsTool: ToolDefinition<{ alertId: string }, RiskSignal[]> = {
  name: "get_risk_signals",
  description: "Retrieve the deterministic risk signals recorded for an alert, scoped to the caller's organization.",
  async execute(deps, ctx, input) {
    const alert = scopeToOrg(await deps.orchestrationStore.getAlert(input.alertId), ctx.organizationId);
    if (!alert) return toolError("Alert not found");
    return toolOk(await deps.orchestrationStore.getRiskSignalsForAlert(input.alertId));
  },
};

export const getMlPredictionTool: ToolDefinition<{ alertId: string }, MlPrediction | null> = {
  name: "get_ml_prediction",
  description: "Retrieve the latest ML prediction recorded for an alert, scoped to the caller's organization.",
  async execute(deps, ctx, input) {
    const alert = scopeToOrg(await deps.orchestrationStore.getAlert(input.alertId), ctx.organizationId);
    if (!alert) return toolError("Alert not found");
    return toolOk(await deps.orchestrationStore.getLatestMlPredictionForAlert(input.alertId));
  },
};

export interface CaseHistoryEntry {
  events: CaseEvent[];
  decisionCount: number;
}

export const getCaseHistoryTool: ToolDefinition<{ caseId: string }, CaseHistoryEntry> = {
  name: "get_case_history",
  description: "Retrieve the event timeline for a case, scoped to the caller's organization.",
  async execute(deps, ctx, input) {
    const kase = scopeToOrg(await deps.orchestrationStore.getCase(input.caseId), ctx.organizationId);
    if (!kase) return toolError("Case not found");
    const [events, decisions] = await Promise.all([
      deps.orchestrationStore.getCaseEvents(input.caseId),
      kase.alert_id ? deps.orchestrationStore.getAnalystDecisionsForAlert(kase.alert_id) : Promise.resolve([]),
    ]);
    return toolOk({ events, decisionCount: decisions.length });
  },
};

export const getApprovedSkillsTool: ToolDefinition<Record<string, never>, AgentSkill[]> = {
  name: "get_approved_skills",
  description:
    "Retrieve skills whose governance_state has reached DEPLOYED (i.e. human-approved for use) — never a " +
    "PROPOSED, REVIEW, APPROVED, or VERSIONED skill, since those have not finished governance yet.",
  async execute(deps, ctx) {
    const skills = await deps.hermesStore.listSkills(ctx.organizationId, { governanceState: "DEPLOYED" });
    return toolOk(skills);
  },
};

export const getInstitutionalKnowledgeTool: ToolDefinition<
  { subjectType?: string; subjectId?: string; limit?: number },
  AgentMemory[]
> = {
  name: "get_institutional_knowledge",
  description: "Retrieve institutional-knowledge memories, optionally filtered by subject, scoped to the org.",
  async execute(deps, ctx, input) {
    const memories = await deps.hermesStore.queryMemories(ctx.organizationId, {
      category: "INSTITUTIONAL",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      limit: Math.min(input.limit ?? 20, 100),
    });
    return toolOk(memories);
  },
};

export const TOOL_REGISTRY = {
  get_customer: getCustomerTool,
  get_transactions: getTransactionsTool,
  get_alert: getAlertTool,
  get_evidence: getEvidenceTool,
  get_risk_signals: getRiskSignalsTool,
  get_ml_prediction: getMlPredictionTool,
  get_case_history: getCaseHistoryTool,
  get_approved_skills: getApprovedSkillsTool,
  get_institutional_knowledge: getInstitutionalKnowledgeTool,
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;

// Re-exported so callers of the registry don't need a separate import for
// the result type.
export type { ToolResult };
