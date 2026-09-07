/**
 * In-memory HermesStore. Used in DEMO mode and by the test suite — no live
 * Supabase connection required, mirroring
 * lib/orchestration/stores/inMemoryStore.ts.
 */
import { randomUUID } from "node:crypto";

import type { AuditLog } from "../../supabase/types.js";
import type {
  CandidateFilter,
  FeedbackFilter,
  HermesStore,
  MemoryFilter,
  SkillFilter,
} from "../store.js";
import type { AgentFeedback, AgentMemory, AgentSkill, LearningCandidate, ModelVersion, RuleVersion } from "../types.js";

export class InMemoryHermesStore implements HermesStore {
  private memories: AgentMemory[] = [];
  private skills: AgentSkill[] = [];
  private feedback: AgentFeedback[] = [];
  private modelVersions: ModelVersion[] = [];
  private ruleVersions: RuleVersion[] = [];
  private candidates: LearningCandidate[] = [];
  private auditLogs: AuditLog[] = [];

  // --- seeding (test/demo use only) ---
  seedSkill(skill: AgentSkill): void {
    this.skills.push(skill);
  }
  seedModelVersion(mv: ModelVersion): void {
    this.modelVersions.push(mv);
  }
  seedRuleVersion(rv: RuleVersion): void {
    this.ruleVersions.push(rv);
  }

  async insertMemory(memory: Omit<AgentMemory, "id" | "created_at" | "updated_at">): Promise<AgentMemory> {
    const now = new Date().toISOString();
    const inserted: AgentMemory = { ...memory, id: randomUUID(), created_at: now, updated_at: now };
    this.memories.push(inserted);
    return inserted;
  }

  async queryMemories(organizationId: string, filter: MemoryFilter): Promise<AgentMemory[]> {
    let results = this.memories.filter((m) => m.organization_id === organizationId);
    if (filter.category) results = results.filter((m) => m.category === filter.category);
    if (filter.subjectType) results = results.filter((m) => m.subject_type === filter.subjectType);
    if (filter.subjectId) results = results.filter((m) => m.subject_id === filter.subjectId);
    results = results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async getMemory(organizationId: string, id: string): Promise<AgentMemory | null> {
    return this.memories.find((m) => m.organization_id === organizationId && m.id === id) ?? null;
  }

  async listSkills(organizationId: string, filter: SkillFilter = {}): Promise<AgentSkill[]> {
    let results = this.skills.filter((s) => s.organization_id === organizationId);
    if (filter.status) results = results.filter((s) => s.status === filter.status);
    if (filter.governanceState) results = results.filter((s) => s.governance_state === filter.governanceState);
    return results;
  }

  async getSkillByNameVersion(organizationId: string, name: string, version: string): Promise<AgentSkill | null> {
    return (
      this.skills.find((s) => s.organization_id === organizationId && s.name === name && s.version === version) ??
      null
    );
  }

  async insertSkill(skill: Omit<AgentSkill, "id" | "created_at" | "updated_at">): Promise<AgentSkill> {
    const now = new Date().toISOString();
    const inserted: AgentSkill = { ...skill, id: randomUUID(), created_at: now, updated_at: now };
    this.skills.push(inserted);
    return inserted;
  }

  async updateSkill(organizationId: string, id: string, patch: Partial<AgentSkill>): Promise<AgentSkill> {
    const idx = this.skills.findIndex((s) => s.organization_id === organizationId && s.id === id);
    if (idx === -1) throw new Error(`Skill ${id} not found`);
    const existing = this.skills[idx] as AgentSkill;
    const updated: AgentSkill = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.skills[idx] = updated;
    return updated;
  }

  async insertFeedback(feedback: Omit<AgentFeedback, "id" | "created_at">): Promise<AgentFeedback> {
    const inserted: AgentFeedback = { ...feedback, id: randomUUID(), created_at: new Date().toISOString() };
    this.feedback.push(inserted);
    return inserted;
  }

  async listFeedback(organizationId: string, filter: FeedbackFilter = {}): Promise<AgentFeedback[]> {
    let results = this.feedback.filter((f) => f.organization_id === organizationId);
    if (filter.alertId) results = results.filter((f) => f.alert_id === filter.alertId);
    if (filter.caseId) results = results.filter((f) => f.case_id === filter.caseId);
    if (filter.feedbackType) results = results.filter((f) => f.feedback_type === filter.feedbackType);
    results = results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async findFeedbackByDecisionId(organizationId: string, analystDecisionId: string): Promise<AgentFeedback | null> {
    return (
      this.feedback.find((f) => {
        if (f.organization_id !== organizationId) return false;
        const meta = f.learning_metadata as Record<string, unknown> | null;
        return meta?.["analystDecisionId"] === analystDecisionId;
      }) ?? null
    );
  }

  async listModelVersions(organizationId: string): Promise<ModelVersion[]> {
    return this.modelVersions.filter((m) => m.organization_id === null || m.organization_id === organizationId);
  }

  async listRuleVersions(organizationId: string): Promise<RuleVersion[]> {
    return this.ruleVersions.filter((r) => r.organization_id === organizationId);
  }

  async insertLearningCandidate(
    candidate: Omit<LearningCandidate, "id" | "created_at" | "updated_at">
  ): Promise<LearningCandidate> {
    const now = new Date().toISOString();
    const inserted: LearningCandidate = { ...candidate, id: randomUUID(), created_at: now, updated_at: now };
    this.candidates.push(inserted);
    return inserted;
  }

  async getLearningCandidate(organizationId: string, id: string): Promise<LearningCandidate | null> {
    return this.candidates.find((c) => c.organization_id === organizationId && c.id === id) ?? null;
  }

  async listLearningCandidates(organizationId: string, filter: CandidateFilter = {}): Promise<LearningCandidate[]> {
    let results = this.candidates.filter((c) => c.organization_id === organizationId);
    if (filter.status) results = results.filter((c) => c.status === filter.status);
    if (filter.improvementType) results = results.filter((c) => c.improvement_type === filter.improvementType);
    return results;
  }

  async updateLearningCandidate(
    organizationId: string,
    id: string,
    patch: Partial<LearningCandidate>
  ): Promise<LearningCandidate> {
    const idx = this.candidates.findIndex((c) => c.organization_id === organizationId && c.id === id);
    if (idx === -1) throw new Error(`Learning candidate ${id} not found`);
    const existing = this.candidates[idx] as LearningCandidate;
    const updated: LearningCandidate = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.candidates[idx] = updated;
    return updated;
  }

  async insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog> {
    const inserted: AuditLog = { ...log, id: randomUUID(), created_at: new Date().toISOString() };
    this.auditLogs.push(inserted);
    return inserted;
  }

  // --- test/debug introspection ---
  getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }
}
