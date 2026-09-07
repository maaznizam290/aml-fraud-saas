/**
 * Real (REAL mode) HermesStore backed by Supabase, using the service-role
 * client — same trust model as
 * lib/orchestration/stores/supabaseStore.ts: this runs as a trusted backend
 * process and is solely responsible for scoping every query to the right
 * organization_id itself (RLS is a second, independent layer of defense
 * for any future direct-client access, not the only one relied on here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuditLog, Database } from "../../supabase/types.js";
import type { CandidateFilter, FeedbackFilter, HermesStore, MemoryFilter, SkillFilter } from "../store.js";
import type { AgentFeedback, AgentMemory, AgentSkill, LearningCandidate, ModelVersion, RuleVersion } from "../types.js";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no row returned`);
  return result.data;
}

export class SupabaseHermesStore implements HermesStore {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async insertMemory(memory: Omit<AgentMemory, "id" | "created_at" | "updated_at">): Promise<AgentMemory> {
    const result = await this.client.from("agent_memory").insert(memory).select("*").single();
    return unwrap(result, "insertMemory");
  }

  async queryMemories(organizationId: string, filter: MemoryFilter): Promise<AgentMemory[]> {
    let query = this.client.from("agent_memory").select("*").eq("organization_id", organizationId);
    if (filter.category) query = query.eq("category", filter.category);
    if (filter.subjectType) query = query.eq("subject_type", filter.subjectType);
    if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
    query = query.order("created_at", { ascending: false });
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) throw new Error(`queryMemories: ${error.message}`);
    return data ?? [];
  }

  async getMemory(organizationId: string, id: string): Promise<AgentMemory | null> {
    const { data, error } = await this.client
      .from("agent_memory")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getMemory: ${error.message}`);
    return data;
  }

  async listSkills(organizationId: string, filter: SkillFilter = {}): Promise<AgentSkill[]> {
    let query = this.client.from("agent_skills").select("*").eq("organization_id", organizationId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.governanceState) query = query.eq("governance_state", filter.governanceState);
    const { data, error } = await query;
    if (error) throw new Error(`listSkills: ${error.message}`);
    return data ?? [];
  }

  async getSkillByNameVersion(organizationId: string, name: string, version: string): Promise<AgentSkill | null> {
    const { data, error } = await this.client
      .from("agent_skills")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .eq("version", version)
      .maybeSingle();
    if (error) throw new Error(`getSkillByNameVersion: ${error.message}`);
    return data;
  }

  async insertSkill(skill: Omit<AgentSkill, "id" | "created_at" | "updated_at">): Promise<AgentSkill> {
    const result = await this.client.from("agent_skills").insert(skill).select("*").single();
    return unwrap(result, "insertSkill");
  }

  async updateSkill(organizationId: string, id: string, patch: Partial<AgentSkill>): Promise<AgentSkill> {
    const result = await this.client
      .from("agent_skills")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(result, "updateSkill");
  }

  async insertFeedback(feedback: Omit<AgentFeedback, "id" | "created_at">): Promise<AgentFeedback> {
    const result = await this.client.from("agent_feedback").insert(feedback).select("*").single();
    return unwrap(result, "insertFeedback");
  }

  async listFeedback(organizationId: string, filter: FeedbackFilter = {}): Promise<AgentFeedback[]> {
    let query = this.client.from("agent_feedback").select("*").eq("organization_id", organizationId);
    if (filter.alertId) query = query.eq("alert_id", filter.alertId);
    if (filter.caseId) query = query.eq("case_id", filter.caseId);
    if (filter.feedbackType) query = query.eq("feedback_type", filter.feedbackType);
    query = query.order("created_at", { ascending: false });
    if (filter.limit) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) throw new Error(`listFeedback: ${error.message}`);
    return data ?? [];
  }

  async findFeedbackByDecisionId(organizationId: string, analystDecisionId: string): Promise<AgentFeedback | null> {
    // learning_metadata->>'analystDecisionId' is how ingestion keys
    // idempotency — see learningEvents.ts.
    const { data, error } = await this.client
      .from("agent_feedback")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("learning_metadata->>analystDecisionId", analystDecisionId)
      .maybeSingle();
    if (error) throw new Error(`findFeedbackByDecisionId: ${error.message}`);
    return data;
  }

  async listModelVersions(organizationId: string): Promise<ModelVersion[]> {
    const { data, error } = await this.client
      .from("model_versions")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`);
    if (error) throw new Error(`listModelVersions: ${error.message}`);
    return data ?? [];
  }

  async listRuleVersions(organizationId: string): Promise<RuleVersion[]> {
    const { data, error } = await this.client.from("rule_versions").select("*").eq("organization_id", organizationId);
    if (error) throw new Error(`listRuleVersions: ${error.message}`);
    return data ?? [];
  }

  async insertLearningCandidate(
    candidate: Omit<LearningCandidate, "id" | "created_at" | "updated_at">
  ): Promise<LearningCandidate> {
    const result = await this.client.from("learning_candidates").insert(candidate).select("*").single();
    return unwrap(result, "insertLearningCandidate");
  }

  async getLearningCandidate(organizationId: string, id: string): Promise<LearningCandidate | null> {
    const { data, error } = await this.client
      .from("learning_candidates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getLearningCandidate: ${error.message}`);
    return data;
  }

  async listLearningCandidates(organizationId: string, filter: CandidateFilter = {}): Promise<LearningCandidate[]> {
    let query = this.client.from("learning_candidates").select("*").eq("organization_id", organizationId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.improvementType) query = query.eq("improvement_type", filter.improvementType);
    const { data, error } = await query;
    if (error) throw new Error(`listLearningCandidates: ${error.message}`);
    return data ?? [];
  }

  async updateLearningCandidate(
    organizationId: string,
    id: string,
    patch: Partial<LearningCandidate>
  ): Promise<LearningCandidate> {
    const result = await this.client
      .from("learning_candidates")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(result, "updateLearningCandidate");
  }

  async insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog> {
    const result = await this.client.from("audit_logs").insert(log).select("*").single();
    return unwrap(result, "insertAuditLog");
  }
}
