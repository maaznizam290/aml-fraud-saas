/**
 * Deterministic, threshold-based candidate generation from recent feedback
 * (task section 2's "learning candidate generation" and section 6's
 * examples: false-positive pattern, prompt improvement proposal, model
 * recommendation). This only ever produces a PROPOSED `learning_candidates`
 * row for a human to review — see governance.ts for what happens next.
 * Nothing here is retrained, redeployed, or applied automatically (task
 * section 8: "Do not automatically retrain or deploy models from a single
 * feedback event" — these thresholds require several, not one).
 */
import type { HermesStore } from "./store.js";
import type { AgentFeedback, LearningCandidate, LearningEventType } from "./types.js";

const PATTERN_THRESHOLD = 3;

interface PatternRule {
  eventType: LearningEventType;
  improvementType: LearningCandidate["improvement_type"];
  title: string;
  describe: (count: number) => string;
}

const RULES: PatternRule[] = [
  {
    eventType: "FALSE_POSITIVE",
    improvementType: "FALSE_POSITIVE_PATTERN",
    title: "Recurring false-positive pattern",
    describe: (n) => `${n} recent alerts were confirmed false positives — the underlying rule/signal may be over-triggering.`,
  },
  {
    eventType: "ML_DISAGREEMENT",
    improvementType: "MODEL_RECOMMENDATION",
    title: "Recurring ML/analyst disagreement",
    describe: (n) => `The ML score disagreed with the final analyst decision on ${n} recent alerts — worth a model review.`,
  },
  {
    eventType: "AI_RECOMMENDATION_DISAGREEMENT",
    improvementType: "PROMPT_IMPROVEMENT",
    title: "Recurring AI recommendation disagreement",
    describe: (n) => `Analysts disagreed with the AI investigation recommendation on ${n} recent alerts — the investigation prompt may need refinement.`,
  },
];

function eventTypesOf(feedback: AgentFeedback): LearningEventType[] {
  const meta = feedback.learning_metadata as Record<string, unknown> | null;
  const eventTypes = meta?.["eventTypes"];
  return Array.isArray(eventTypes) ? (eventTypes as LearningEventType[]) : [];
}

export async function generateCandidatesFromFeedback(
  store: HermesStore,
  organizationId: string,
  proposedBy: string | null = null
): Promise<LearningCandidate[]> {
  const recentFeedback = await store.listFeedback(organizationId, { limit: 200 });
  const existingCandidates = await store.listLearningCandidates(organizationId);

  const generated: LearningCandidate[] = [];

  for (const rule of RULES) {
    const matching = recentFeedback.filter((f) => eventTypesOf(f).includes(rule.eventType));
    if (matching.length < PATTERN_THRESHOLD) continue;

    const patternKey = `auto:${rule.eventType}`;
    const alreadyProposed = existingCandidates.some((c) => {
      const payload = c.payload as Record<string, unknown> | null;
      return payload?.["patternKey"] === patternKey && c.status !== "DEPLOYED" && !c.rejection_reason;
    });
    if (alreadyProposed) continue;

    const candidate = await store.insertLearningCandidate({
      organization_id: organizationId,
      improvement_type: rule.improvementType,
      title: rule.title,
      description: rule.describe(matching.length),
      payload: { patternKey, feedbackCount: matching.length, eventType: rule.eventType },
      supporting_feedback_ids: matching.slice(0, 20).map((f) => f.id),
      status: "PROPOSED",
      related_skill_id: null,
      related_model_version_id: null,
      related_rule_version_id: null,
      proposed_by: proposedBy,
      reviewed_by: null,
      reviewed_at: null,
      approved_by: null,
      approved_at: null,
      versioned_at: null,
      deployed_at: null,
      rejection_reason: null,
    });

    await store.insertAuditLog({
      organization_id: organizationId,
      actor_id: proposedBy,
      actor_role: proposedBy ? "SYSTEM" : null,
      action: "learning_candidate_generated",
      entity_type: "learning_candidate",
      entity_id: candidate.id,
      correlation_id: candidate.id,
      metadata: { patternKey, feedbackCount: matching.length },
    });

    generated.push(candidate);
  }

  return generated;
}
