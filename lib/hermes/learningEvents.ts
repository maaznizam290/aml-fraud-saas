/**
 * Classifies an analyst decision into one or more LearningEventType values
 * (task section 4) and ingests exactly one agent_feedback row for it,
 * idempotently. This is pure classification + storage — it never triggers
 * a candidate improvement or a model/rule change by itself (see
 * learningCandidates.ts and governance.ts for the separate, human-gated
 * next step).
 */
import type { FeedbackType } from "../supabase/types.js";
import type { HermesStore } from "./store.js";
import type { AgentFeedback, AnalystDecisionContext, LearningEventType } from "./types.js";

const ML_DISAGREEMENT_THRESHOLD = 0.5;

export function classifyLearningEvents(ctx: AnalystDecisionContext): LearningEventType[] {
  const events: LearningEventType[] = [];

  if (ctx.action === "APPROVE") events.push("ANALYST_APPROVAL");
  if (ctx.action === "REJECT") events.push("ANALYST_REJECTION");
  if (ctx.action === "OVERRIDE") events.push("ANALYST_OVERRIDE");

  if (ctx.agreedWithAi === false) events.push("AI_RECOMMENDATION_DISAGREEMENT");

  if (ctx.mlScore !== null) {
    const mlLeansFraud = ctx.mlScore >= ML_DISAGREEMENT_THRESHOLD;
    const analystEscalated = ctx.decision === "ESCALATE";
    const analystCleared = ctx.decision === "CLEAR";
    if ((mlLeansFraud && analystCleared) || (!mlLeansFraud && analystEscalated)) {
      events.push("ML_DISAGREEMENT");
    }
  }

  if (ctx.finalCaseDisposition === "FALSE_POSITIVE") events.push("FALSE_POSITIVE");
  if (ctx.finalCaseDisposition === "CONFIRMED_FRAUD") events.push("CONFIRMED_SUSPICIOUS");
  if (ctx.finalCaseDisposition) events.push("INVESTIGATION_OUTCOME");

  return events;
}

// Priority order when multiple event types apply to one decision — the DB's
// feedback_type is a single coarse enum (CONFIRM | OVERRULE | CORRECTION |
// COMMENT | RATING); the full classification is preserved regardless in
// learning_metadata.eventTypes.
const FEEDBACK_TYPE_PRIORITY: Array<[LearningEventType, FeedbackType]> = [
  ["ANALYST_OVERRIDE", "OVERRULE"],
  ["ANALYST_REJECTION", "OVERRULE"],
  ["AI_RECOMMENDATION_DISAGREEMENT", "OVERRULE"],
  ["ML_DISAGREEMENT", "CORRECTION"],
  ["FALSE_POSITIVE", "CORRECTION"],
  ["CONFIRMED_SUSPICIOUS", "CONFIRM"],
  ["ANALYST_APPROVAL", "CONFIRM"],
  ["INVESTIGATION_OUTCOME", "COMMENT"],
];

export function primaryFeedbackType(events: LearningEventType[]): FeedbackType {
  for (const [event, feedbackType] of FEEDBACK_TYPE_PRIORITY) {
    if (events.includes(event)) return feedbackType;
  }
  return "COMMENT";
}

export async function ingestDecisionFeedback(
  store: HermesStore,
  organizationId: string,
  ctx: AnalystDecisionContext
): Promise<{ feedback: AgentFeedback; reused: boolean }> {
  const existing = await store.findFeedbackByDecisionId(organizationId, ctx.analystDecisionId);
  if (existing) {
    return { feedback: existing, reused: true };
  }

  const eventTypes = classifyLearningEvents(ctx);
  const feedbackType = primaryFeedbackType(eventTypes);

  const feedback = await store.insertFeedback({
    organization_id: organizationId,
    alert_id: ctx.alertId,
    case_id: ctx.caseId,
    ai_recommendation_id: ctx.aiRecommendationId,
    analyst_id: ctx.analystId,
    feedback_type: feedbackType,
    decision: ctx.decision,
    rating: null,
    comments: ctx.rationale,
    learning_metadata: {
      analystDecisionId: ctx.analystDecisionId,
      eventTypes,
      action: ctx.action,
      aiDisposition: ctx.aiDisposition,
      agreedWithAi: ctx.agreedWithAi,
      mlScore: ctx.mlScore,
      mlPrediction: ctx.mlPrediction,
      finalCaseDisposition: ctx.finalCaseDisposition ?? null,
    },
  });

  await store.insertAuditLog({
    organization_id: organizationId,
    actor_id: ctx.analystId,
    actor_role: "ANALYST",
    action: "hermes_learning_event",
    entity_type: "agent_feedback",
    entity_id: feedback.id,
    correlation_id: ctx.alertId,
    metadata: { eventTypes, analystDecisionId: ctx.analystDecisionId },
  });

  return { feedback, reused: false };
}
