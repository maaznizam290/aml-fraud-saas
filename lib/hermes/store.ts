/**
 * Persistence abstraction for the Hermes layer, mirroring the pattern from
 * feature/n8n-orchestration (lib/orchestration/store.ts): one interface,
 * `InMemoryHermesStore` for tests/local runs, `SupabaseHermesStore` for a
 * real deployment. `HermesProvider` (provider.ts) is the layer above this
 * that the rest of the app actually talks to — this file is plumbing.
 */
import type { AuditLog, GovernanceStatus, ImprovementType, SkillStatus } from "../supabase/types.js";
import type { AgentFeedback, AgentMemory, AgentSkill, LearningCandidate, ModelVersion, RuleVersion } from "./types.js";

export interface MemoryFilter {
  category?: AgentMemory["category"];
  subjectType?: string;
  subjectId?: string;
  limit?: number;
}

export interface SkillFilter {
  status?: SkillStatus;
  governanceState?: GovernanceStatus;
}

export interface FeedbackFilter {
  alertId?: string;
  caseId?: string;
  feedbackType?: AgentFeedback["feedback_type"];
  limit?: number;
}

export interface CandidateFilter {
  status?: GovernanceStatus;
  improvementType?: ImprovementType;
}

export interface HermesStore {
  insertMemory(memory: Omit<AgentMemory, "id" | "created_at" | "updated_at">): Promise<AgentMemory>;
  queryMemories(organizationId: string, filter: MemoryFilter): Promise<AgentMemory[]>;
  getMemory(organizationId: string, id: string): Promise<AgentMemory | null>;

  listSkills(organizationId: string, filter?: SkillFilter): Promise<AgentSkill[]>;
  getSkillByNameVersion(organizationId: string, name: string, version: string): Promise<AgentSkill | null>;
  insertSkill(skill: Omit<AgentSkill, "id" | "created_at" | "updated_at">): Promise<AgentSkill>;
  updateSkill(organizationId: string, id: string, patch: Partial<AgentSkill>): Promise<AgentSkill>;

  insertFeedback(feedback: Omit<AgentFeedback, "id" | "created_at">): Promise<AgentFeedback>;
  listFeedback(organizationId: string, filter?: FeedbackFilter): Promise<AgentFeedback[]>;
  /** Dedup lookup for idempotent feedback ingestion — see learningEvents.ts. */
  findFeedbackByDecisionId(organizationId: string, analystDecisionId: string): Promise<AgentFeedback | null>;

  listModelVersions(organizationId: string): Promise<ModelVersion[]>;
  listRuleVersions(organizationId: string): Promise<RuleVersion[]>;

  insertLearningCandidate(
    candidate: Omit<LearningCandidate, "id" | "created_at" | "updated_at">
  ): Promise<LearningCandidate>;
  getLearningCandidate(organizationId: string, id: string): Promise<LearningCandidate | null>;
  listLearningCandidates(organizationId: string, filter?: CandidateFilter): Promise<LearningCandidate[]>;
  updateLearningCandidate(
    organizationId: string,
    id: string,
    patch: Partial<LearningCandidate>
  ): Promise<LearningCandidate>;

  insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog>;
  /** Audit Trail page reader (feature/investigation-dashboard) — Hermes
   * writes to the same shared `audit_logs` table as the orchestration
   * layer, so a unified trail merges this with
   * `OrchestrationStore.listAuditLogs`. */
  listAuditLogs(
    organizationId: string,
    filter?: { limit?: number; before?: string; correlationId?: string }
  ): Promise<AuditLog[]>;
}
