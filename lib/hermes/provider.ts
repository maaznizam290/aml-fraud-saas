/**
 * HermesProvider (task section 2): the one interface the rest of the SaaS
 * is allowed to depend on for anything learning-related. Nothing outside
 * lib/hermes/ should import a HermesStore or reach into Supabase directly
 * for agent_memory/agent_skills/agent_feedback/learning_candidates.
 *
 * No real "Hermes" runtime/API exists to integrate with (see
 * docs/HERMES.md "Reconnaissance" — this was verified, not assumed) — this
 * is a clean adapter over this project's own storage, ready to be
 * re-implemented against a real Hermes service later without touching any
 * caller. `LocalHermesProvider` is today's implementation;
 * `UnavailableHermesProvider` is the fail-safe fallback (task section 10).
 *
 * Every method returns a `HermesResult`, never throws, and never blocks —
 * see types.ts's `HermesResult`.
 */
import type {
  AgentFeedback,
  AgentMemory,
  AgentSkill,
  AnalystDecisionContext,
  CreateMemoryInput,
  GovernanceTransitionInput,
  HermesResult,
  LearningCandidate,
  MemoryQuery,
  ModelVersion,
  ProposeCandidateInput,
  ProposeSkillInput,
  RuleVersion,
} from "./types.js";
import type { AuditLog } from "../supabase/types.js";
import type { CandidateFilter, FeedbackFilter, SkillFilter } from "./store.js";

export interface HermesProvider {
  readonly providerName: string;
  readonly available: boolean;

  // --- memory ---
  retrieveMemories(organizationId: string, query: MemoryQuery): Promise<HermesResult<AgentMemory[]>>;
  createMemory(organizationId: string, input: CreateMemoryInput): Promise<HermesResult<AgentMemory>>;
  /** Convenience over retrieveMemories({ category: "INSTITUTIONAL" }). */
  retrieveInstitutionalKnowledge(organizationId: string, subjectType?: string): Promise<HermesResult<AgentMemory[]>>;

  // --- feedback ingestion + retrieval ---
  ingestFeedback(
    organizationId: string,
    context: AnalystDecisionContext
  ): Promise<HermesResult<AgentFeedback[]>>;
  /** Read-only — backs the learning dashboard's feedback/analytics views
   * (task section 12). */
  listFeedback(organizationId: string, filter?: FeedbackFilter): Promise<HermesResult<AgentFeedback[]>>;

  // --- skill management ---
  listSkills(organizationId: string, filter?: SkillFilter): Promise<HermesResult<AgentSkill[]>>;
  proposeSkill(organizationId: string, input: ProposeSkillInput): Promise<HermesResult<AgentSkill>>;

  // --- learning candidate generation + governance ---
  proposeCandidate(organizationId: string, input: ProposeCandidateInput): Promise<HermesResult<LearningCandidate>>;
  listCandidates(organizationId: string, filter?: CandidateFilter): Promise<HermesResult<LearningCandidate[]>>;
  transitionCandidate(
    organizationId: string,
    input: GovernanceTransitionInput
  ): Promise<HermesResult<LearningCandidate>>;
  /** Heuristic scan over recent feedback for recurring patterns worth
   * proposing as a candidate — see learningCandidates.ts. Always produces a
   * PROPOSED candidate for a human to review; never applies anything. */
  generateCandidatesFromFeedback(organizationId: string): Promise<HermesResult<LearningCandidate[]>>;

  // --- read-only reference data (Model Registry / Audit Trail pages) ---
  listModelVersions(organizationId: string): Promise<HermesResult<ModelVersion[]>>;
  listRuleVersions(organizationId: string): Promise<HermesResult<RuleVersion[]>>;
  listAuditLogs(
    organizationId: string,
    filter?: { limit?: number; before?: string; correlationId?: string }
  ): Promise<HermesResult<AuditLog[]>>;
}
