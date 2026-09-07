/**
 * Fail-safe fallback (task section 10): used when Hermes is disabled
 * (`HERMES_ENABLED=false`) or when constructing the real provider throws
 * (e.g. Supabase client construction fails). Every method resolves
 * `hermesUnavailable(...)` immediately — no throw, no network call, no
 * retry loop that could stall a caller. `available` is `false` so callers
 * that want to skip optional Hermes-derived UI can check it directly
 * instead of making a round trip first.
 *
 * This is the module that makes the fail-safe requirement concrete: the
 * main AML investigation system (alert intake, ML scoring, human review,
 * case resolution — all of feature/n8n-orchestration) never imports
 * anything from lib/hermes, so a Hermes outage cannot block it. Whatever
 * *does* call into Hermes (e.g. surfacing a recommendation, recording
 * feedback) always gets a well-formed `HermesResult` back, never a thrown
 * error or a hang.
 */
import type { CandidateFilter, FeedbackFilter, SkillFilter } from "../store.js";
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
} from "../types.js";
import { hermesUnavailable } from "../types.js";
import type { AuditLog } from "../../supabase/types.js";
import type { HermesProvider } from "../provider.js";

const REASON = "Hermes is unavailable — the main investigation system continues unaffected.";

export class UnavailableHermesProvider implements HermesProvider {
  readonly providerName = "unavailable";
  readonly available = false;

  constructor(private readonly reason: string = REASON) {}

  async retrieveMemories(_organizationId: string, _query: MemoryQuery): Promise<HermesResult<AgentMemory[]>> {
    return hermesUnavailable(this.reason);
  }

  async createMemory(_organizationId: string, _input: CreateMemoryInput): Promise<HermesResult<AgentMemory>> {
    return hermesUnavailable(this.reason);
  }

  async retrieveInstitutionalKnowledge(
    _organizationId: string,
    _subjectType?: string
  ): Promise<HermesResult<AgentMemory[]>> {
    return hermesUnavailable(this.reason);
  }

  async ingestFeedback(
    _organizationId: string,
    _context: AnalystDecisionContext
  ): Promise<HermesResult<AgentFeedback[]>> {
    return hermesUnavailable(this.reason);
  }

  async listFeedback(_organizationId: string, _filter?: FeedbackFilter): Promise<HermesResult<AgentFeedback[]>> {
    return hermesUnavailable(this.reason);
  }

  async listSkills(_organizationId: string, _filter?: SkillFilter): Promise<HermesResult<AgentSkill[]>> {
    return hermesUnavailable(this.reason);
  }

  async proposeSkill(_organizationId: string, _input: ProposeSkillInput): Promise<HermesResult<AgentSkill>> {
    return hermesUnavailable(this.reason);
  }

  async proposeCandidate(
    _organizationId: string,
    _input: ProposeCandidateInput
  ): Promise<HermesResult<LearningCandidate>> {
    return hermesUnavailable(this.reason);
  }

  async listCandidates(
    _organizationId: string,
    _filter?: CandidateFilter
  ): Promise<HermesResult<LearningCandidate[]>> {
    return hermesUnavailable(this.reason);
  }

  async transitionCandidate(
    _organizationId: string,
    _input: GovernanceTransitionInput
  ): Promise<HermesResult<LearningCandidate>> {
    return hermesUnavailable(this.reason);
  }

  async generateCandidatesFromFeedback(_organizationId: string): Promise<HermesResult<LearningCandidate[]>> {
    return hermesUnavailable(this.reason);
  }

  async listModelVersions(_organizationId: string): Promise<HermesResult<ModelVersion[]>> {
    return hermesUnavailable(this.reason);
  }

  async listRuleVersions(_organizationId: string): Promise<HermesResult<RuleVersion[]>> {
    return hermesUnavailable(this.reason);
  }

  async listAuditLogs(
    _organizationId: string,
    _filter?: { limit?: number; before?: string; correlationId?: string }
  ): Promise<HermesResult<AuditLog[]>> {
    return hermesUnavailable(this.reason);
  }
}
