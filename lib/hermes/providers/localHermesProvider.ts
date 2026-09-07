/**
 * The concrete `HermesProvider` (task section 2/10): composes a
 * `HermesStore` with learningEvents.ts / governance.ts / skills.ts /
 * learningCandidates.ts into the full interface. Every method is wrapped in
 * try/catch and returns a `HermesResult` — a thrown error here degrades to
 * `hermesUnavailable(...)`, it never propagates and never blocks the caller
 * (task section 10: "Hermes failure must never block alert investigation").
 *
 * This is still "local" in the sense that there is no external Hermes
 * runtime being called — see provider.ts's module docstring. Swapping in a
 * real Hermes service later means writing a new class against this same
 * interface, not touching any caller.
 */
import type { CandidateFilter, FeedbackFilter, HermesStore, SkillFilter } from "../store.js";
import { transitionCandidate } from "../governance.js";
import { generateCandidatesFromFeedback as runGenerateCandidates } from "../learningCandidates.js";
import { ingestDecisionFeedback } from "../learningEvents.js";
import { proposeSkill as runProposeSkill } from "../skills.js";
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
  ProposeCandidateInput,
  ProposeSkillInput,
} from "../types.js";
import { hermesOk, hermesUnavailable } from "../types.js";
import type { Json } from "../../supabase/types.js";

// Public input shapes take `Record<string, unknown>` for caller ergonomics
// (a plain object literal, not the recursive `Json` union); every value
// actually written to Hermes learning data is already-serializable content
// (analyst-decision context, ML scores, rule payloads — never a class
// instance or a secret), so this narrowing cast is safe at the store
// boundary and nowhere else.
function toJson(value: Record<string, unknown>): Json {
  return value as Json;
}
import type { HermesProvider } from "../provider.js";

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class LocalHermesProvider implements HermesProvider {
  readonly providerName = "local";
  readonly available = true;

  constructor(private readonly store: HermesStore) {}

  async retrieveMemories(organizationId: string, query: MemoryQuery): Promise<HermesResult<AgentMemory[]>> {
    try {
      const memories = await this.store.queryMemories(organizationId, {
        category: query.category,
        subjectType: query.subjectType,
        subjectId: query.subjectId,
        limit: query.limit,
      });
      return hermesOk(memories);
    } catch (err) {
      return hermesUnavailable(`retrieveMemories failed: ${toMessage(err)}`);
    }
  }

  async createMemory(organizationId: string, input: CreateMemoryInput): Promise<HermesResult<AgentMemory>> {
    try {
      const memory = await this.store.insertMemory({
        organization_id: organizationId,
        category: input.category,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        content: toJson(input.content),
        confidence: input.confidence ?? null,
        source: input.source ?? null,
      });
      await this.store.insertAuditLog({
        organization_id: organizationId,
        actor_id: null,
        actor_role: null,
        action: "hermes_memory_created",
        entity_type: "agent_memory",
        entity_id: memory.id,
        correlation_id: null,
        metadata: { category: input.category },
      });
      return hermesOk(memory);
    } catch (err) {
      return hermesUnavailable(`createMemory failed: ${toMessage(err)}`);
    }
  }

  async retrieveInstitutionalKnowledge(
    organizationId: string,
    subjectType?: string
  ): Promise<HermesResult<AgentMemory[]>> {
    return this.retrieveMemories(organizationId, { category: "INSTITUTIONAL", subjectType });
  }

  async ingestFeedback(
    organizationId: string,
    context: AnalystDecisionContext
  ): Promise<HermesResult<AgentFeedback[]>> {
    try {
      const { feedback } = await ingestDecisionFeedback(this.store, organizationId, context);
      return hermesOk([feedback]);
    } catch (err) {
      return hermesUnavailable(`ingestFeedback failed: ${toMessage(err)}`);
    }
  }

  async listFeedback(organizationId: string, filter?: FeedbackFilter): Promise<HermesResult<AgentFeedback[]>> {
    try {
      return hermesOk(await this.store.listFeedback(organizationId, filter));
    } catch (err) {
      return hermesUnavailable(`listFeedback failed: ${toMessage(err)}`);
    }
  }

  async listSkills(organizationId: string, filter?: SkillFilter): Promise<HermesResult<AgentSkill[]>> {
    try {
      return hermesOk(await this.store.listSkills(organizationId, filter));
    } catch (err) {
      return hermesUnavailable(`listSkills failed: ${toMessage(err)}`);
    }
  }

  async proposeSkill(organizationId: string, input: ProposeSkillInput): Promise<HermesResult<AgentSkill>> {
    try {
      return hermesOk(await runProposeSkill(this.store, organizationId, input));
    } catch (err) {
      return hermesUnavailable(`proposeSkill failed: ${toMessage(err)}`);
    }
  }

  async proposeCandidate(
    organizationId: string,
    input: ProposeCandidateInput
  ): Promise<HermesResult<LearningCandidate>> {
    try {
      const candidate = await this.store.insertLearningCandidate({
        organization_id: organizationId,
        improvement_type: input.improvementType,
        title: input.title,
        description: input.description,
        payload: toJson(input.payload),
        supporting_feedback_ids: input.supportingFeedbackIds ?? [],
        status: "PROPOSED",
        related_skill_id: input.relatedSkillId ?? null,
        related_model_version_id: input.relatedModelVersionId ?? null,
        related_rule_version_id: input.relatedRuleVersionId ?? null,
        proposed_by: input.proposedBy,
        reviewed_by: null,
        reviewed_at: null,
        approved_by: null,
        approved_at: null,
        versioned_at: null,
        deployed_at: null,
        rejection_reason: null,
      });
      await this.store.insertAuditLog({
        organization_id: organizationId,
        actor_id: input.proposedBy,
        actor_role: null,
        action: "learning_candidate_proposed",
        entity_type: "learning_candidate",
        entity_id: candidate.id,
        correlation_id: candidate.id,
        metadata: { improvementType: input.improvementType },
      });
      return hermesOk(candidate);
    } catch (err) {
      return hermesUnavailable(`proposeCandidate failed: ${toMessage(err)}`);
    }
  }

  async listCandidates(
    organizationId: string,
    filter?: CandidateFilter
  ): Promise<HermesResult<LearningCandidate[]>> {
    try {
      return hermesOk(await this.store.listLearningCandidates(organizationId, filter));
    } catch (err) {
      return hermesUnavailable(`listCandidates failed: ${toMessage(err)}`);
    }
  }

  async transitionCandidate(
    organizationId: string,
    input: GovernanceTransitionInput
  ): Promise<HermesResult<LearningCandidate>> {
    try {
      return hermesOk(await transitionCandidate(this.store, organizationId, input));
    } catch (err) {
      return hermesUnavailable(`transitionCandidate failed: ${toMessage(err)}`);
    }
  }

  async generateCandidatesFromFeedback(organizationId: string): Promise<HermesResult<LearningCandidate[]>> {
    try {
      return hermesOk(await runGenerateCandidates(this.store, organizationId));
    } catch (err) {
      return hermesUnavailable(`generateCandidatesFromFeedback failed: ${toMessage(err)}`);
    }
  }
}
