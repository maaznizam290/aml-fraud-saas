/**
 * Human review + case resolution (task sections 8-9). This is the only
 * place in the whole orchestration layer where a disposition becomes
 * binding — everything upstream (investigationService.ts) produces a
 * recommendation and then stops at HUMAN_REVIEW. Every function here
 * requires an `analystId` and records a full audit trail (analyst,
 * timestamp, original recommendation, final decision, override status,
 * rationale).
 */
import { recordAudit, type AuditContext } from "./audit.js";
import type { NotificationDispatcher } from "./notifications/notifier.js";
import type { OrchestrationStore } from "./store.js";
import type { CaseResolutionInput, HumanReviewInput, HumanReviewResult } from "./types.js";

export class HumanReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanReviewError";
  }
}

export async function submitHumanReview(
  store: OrchestrationStore,
  input: HumanReviewInput
): Promise<HumanReviewResult> {
  if (!input.rationale || input.rationale.trim().length === 0) {
    throw new HumanReviewError("rationale is required for every human review decision");
  }
  if (input.action === "OVERRIDE" && !input.overrideDisposition) {
    throw new HumanReviewError("overrideDisposition is required when action is OVERRIDE");
  }

  const alert = await store.getAlert(input.alertId);
  if (!alert) throw new HumanReviewError(`Alert ${input.alertId} not found`);

  const recommendation = await store.findRecommendationByAlertId(input.alertId);

  const { decision, agreedWithAi, overrideReason } = resolveDecision(input, recommendation?.disposition ?? null);

  const auditCtx: AuditContext = {
    organizationId: alert.organization_id,
    actorId: input.analystId,
    actorRole: "ANALYST",
    correlationId: recommendation?.metadata && typeof recommendation.metadata === "object" && "correlationId" in recommendation.metadata
      ? String((recommendation.metadata as Record<string, unknown>)["correlationId"])
      : input.alertId,
  };

  await store.insertAnalystDecision({
    organization_id: alert.organization_id,
    alert_id: alert.id,
    ai_recommendation_id: recommendation?.id ?? null,
    analyst_id: input.analystId,
    decision,
    agreed_with_ai: agreedWithAi,
    override_reason: overrideReason,
    notes: input.rationale,
  });

  await recordAudit(store, auditCtx, "analyst_decision_recorded", "alert", alert.id, {
    action: input.action,
    originalRecommendation: recommendation?.disposition ?? null,
    finalDecision: decision,
    agreedWithAi,
  });

  const { case: theCase } = await store.getOrCreateCase({
    organizationId: alert.organization_id,
    alertId: alert.id,
    customerId: alert.customer_id,
    priority: "MEDIUM",
  });

  const updatedCase = await store.updateCase(theCase.id, {
    status: "IN_PROGRESS",
    assigned_analyst_id: theCase.assigned_analyst_id ?? input.analystId,
  });
  await store.insertCaseEvent({
    organization_id: alert.organization_id,
    case_id: updatedCase.id,
    event_type: "analyst_decision_recorded",
    actor_id: input.analystId,
    actor_role: "ANALYST",
    description: `Analyst ${input.action.toLowerCase()}d the AI recommendation. Decision: ${decision}.`,
    metadata: { action: input.action, decision, agreedWithAi },
  });

  return { alertId: alert.id, caseId: updatedCase.id, decision, agreedWithAi, overrideReason };
}

function resolveDecision(
  input: HumanReviewInput,
  aiDisposition: HumanReviewResult["decision"] | null
): { decision: HumanReviewResult["decision"]; agreedWithAi: boolean; overrideReason: string | null } {
  switch (input.action) {
    case "APPROVE":
      return { decision: aiDisposition ?? "REFER", agreedWithAi: true, overrideReason: null };
    case "REJECT":
      // Rejecting the AI's recommendation means the analyst does not accept
      // it as-is; CLEAR is recorded as the resulting decision (no
      // escalation proceeds without an analyst affirmatively choosing it).
      return { decision: "CLEAR", agreedWithAi: false, overrideReason: input.rationale };
    case "OVERRIDE":
      // input.overrideDisposition is guaranteed present by the validation
      // in submitHumanReview.
      return {
        decision: input.overrideDisposition as HumanReviewResult["decision"],
        agreedWithAi: input.overrideDisposition === aiDisposition,
        overrideReason: input.rationale,
      };
  }
}

/**
 * Final step of the case workflow (task section 9): Alert -> Investigation
 * -> Recommendation -> Human Review -> Case -> Resolution. This is the only
 * function that sets a case's terminal disposition and moves the alert to
 * RESOLVED — always driven by an explicit analyst action, never automatic.
 */
export async function resolveCase(
  store: OrchestrationStore,
  notifier: NotificationDispatcher,
  input: CaseResolutionInput
): Promise<void> {
  const theCase = await store.getCase(input.caseId);
  if (!theCase) throw new HumanReviewError(`Case ${input.caseId} not found`);
  if (!input.resolutionReason || input.resolutionReason.trim().length === 0) {
    throw new HumanReviewError("resolutionReason is required to resolve a case");
  }

  const now = new Date().toISOString();
  const updated = await store.updateCase(theCase.id, {
    status: "RESOLVED",
    disposition: input.disposition,
    resolution_reason: input.resolutionReason,
    priority: input.priority ?? theCase.priority,
    resolved_at: now,
  });

  await store.insertCaseEvent({
    organization_id: theCase.organization_id,
    case_id: theCase.id,
    event_type: "case_resolved",
    actor_id: input.analystId,
    actor_role: "ANALYST",
    description: `Case resolved as ${input.disposition}: ${input.resolutionReason}`,
    metadata: { disposition: input.disposition },
  });

  const auditCtx: AuditContext = {
    organizationId: theCase.organization_id,
    actorId: input.analystId,
    actorRole: "ANALYST",
    correlationId: theCase.alert_id ?? theCase.id,
  };
  await recordAudit(store, auditCtx, "case_resolved", "case", theCase.id, {
    disposition: input.disposition,
    resolutionReason: input.resolutionReason,
  });

  if (theCase.alert_id) {
    await store.updateAlertStatus(theCase.alert_id, "RESOLVED", { resolved_at: now });
  }

  await notifier.notifyCaseResolved(store, auditCtx, {
    organizationId: theCase.organization_id,
    caseId: theCase.id,
    analystId: input.analystId,
    disposition: input.disposition,
    recipientId: updated.assigned_analyst_id,
  });
}
