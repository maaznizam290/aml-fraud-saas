/**
 * Shared contracts for the Hermes controlled self-learning layer.
 *
 * Reuses the tables and enums feature/supabase-schema already created for
 * this purpose (agent_memory, agent_skills, agent_feedback, model_versions,
 * rule_versions — see supabase/migrations/20250101000016_hermes_agent_memory.sql
 * and .../20250101000017_model_governance.sql, both explicitly commented as
 * "storage foundation only... owned by feature/hermes-learning") plus one
 * new table this branch adds, `learning_candidates`
 * (supabase/migrations/20250101000019_learning_candidates.sql), for
 * improvement proposals that don't fit the skill/model/rule shape (evidence
 * prioritization, false-positive patterns, prompt improvements).
 *
 * No autonomous adverse action or policy change is representable anywhere
 * in this file — see docs/HERMES.md "What is and is not autonomous".
 */
import type {
  AgentFeedback,
  AgentMemory,
  AgentSkill,
  FeedbackType,
  GovernanceStatus,
  ImprovementType,
  LearningCandidate,
  MemoryCategory,
  ModelVersion,
  RecommendationDisposition,
  RuleVersion,
  SkillStatus,
} from "../supabase/types.js";

export type {
  AgentFeedback,
  AgentMemory,
  AgentSkill,
  FeedbackType,
  GovernanceStatus,
  ImprovementType,
  LearningCandidate,
  MemoryCategory,
  ModelVersion,
  RuleVersion,
  SkillStatus,
};

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export interface MemoryQuery {
  category?: MemoryCategory;
  subjectType?: string;
  subjectId?: string;
  limit?: number;
}

export interface CreateMemoryInput {
  category: MemoryCategory;
  subjectType?: string | null;
  subjectId?: string | null;
  content: Record<string, unknown>;
  confidence?: number | null;
  source?: string | null;
}

// ---------------------------------------------------------------------------
// Learning events (task section 4)
// ---------------------------------------------------------------------------

/**
 * The application-level classification of what happened. Several of these
 * can apply to the same analyst decision at once (e.g. an OVERRIDE that is
 * also an AI_RECOMMENDATION_DISAGREEMENT and an ML_DISAGREEMENT) — all
 * applicable types are recorded together against one agent_feedback row
 * (see learningEvents.ts), keyed by the originating analyst_decisions row
 * so a retried/duplicate call never creates a second one.
 */
export type LearningEventType =
  | "ANALYST_APPROVAL"
  | "ANALYST_REJECTION"
  | "ANALYST_OVERRIDE"
  | "FALSE_POSITIVE"
  | "CONFIRMED_SUSPICIOUS"
  | "INVESTIGATION_OUTCOME"
  | "ML_DISAGREEMENT"
  | "AI_RECOMMENDATION_DISAGREEMENT";

/**
 * Everything learningEvents.ts needs to classify and record feedback for
 * one analyst decision. Deliberately a plain data shape, not a dependency
 * on lib/orchestration's store — whatever calls into Hermes (an API route,
 * a test, a future direct integration) assembles this from data it already
 * has, keeping the coupling one-directional (Hermes may know about
 * orchestration's types; orchestration must never know about Hermes).
 */
export interface AnalystDecisionContext {
  organizationId: string;
  alertId: string;
  caseId: string | null;
  analystDecisionId: string;
  analystId: string;
  action: "APPROVE" | "REJECT" | "OVERRIDE";
  decision: RecommendationDisposition;
  agreedWithAi: boolean | null;
  aiRecommendationId: string | null;
  aiDisposition: RecommendationDisposition | null;
  mlScore: number | null;
  mlPrediction: string | null;
  finalCaseDisposition?: "CONFIRMED_FRAUD" | "FALSE_POSITIVE" | null;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Skills (task section 7)
// ---------------------------------------------------------------------------

export interface ProposeSkillInput {
  name: string;
  description: string;
  version: string;
  source?: string;
  metadata?: Record<string, unknown>;
  proposedBy: string;
}

// ---------------------------------------------------------------------------
// Governance / candidate improvements (task section 6)
// ---------------------------------------------------------------------------

export interface ProposeCandidateInput {
  improvementType: ImprovementType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  supportingFeedbackIds?: string[];
  relatedSkillId?: string | null;
  relatedModelVersionId?: string | null;
  relatedRuleVersionId?: string | null;
  proposedBy: string;
}

export type GovernanceAction = "REVIEW" | "APPROVE" | "VERSION" | "DEPLOY" | "REJECT";

export interface GovernanceTransitionInput {
  candidateId: string;
  action: GovernanceAction;
  actorId: string;
  actorRole: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Result envelope — HermesProvider methods never throw (task section 10).
// ---------------------------------------------------------------------------

export type HermesResult<T> = { ok: true; data: T } | { ok: false; error: string; degraded: true };

export function hermesOk<T>(data: T): HermesResult<T> {
  return { ok: true, data };
}

export function hermesUnavailable<T>(error: string): HermesResult<T> {
  return { ok: false, error, degraded: true };
}
