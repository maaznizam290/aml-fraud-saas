/**
 * Governance lifecycle for learning_candidates (task section 6):
 * PROPOSED -> REVIEW -> APPROVED -> VERSIONED -> DEPLOYED. This is the
 * single place that lifecycle is enforced — the database does not enforce
 * transition ordering (see docs/DATABASE.md: "governance state transitions
 * aren't state-machine-enforced by the database... belongs to whichever
 * branch owns the governance UI/workflow" — that's this one).
 *
 * Every transition requires a human actor with ADMIN or COMPLIANCE_MANAGER
 * role — there is no system/automatic path through this function, and
 * `GovernanceError` is thrown for anything that would skip a step, that a
 * proposer tries to approve themselves, or that lacks a required reason.
 * Nothing here — or anywhere else in this branch — ever applies a
 * candidate's payload to production; DEPLOYED only *records* that a human
 * approved doing so elsewhere.
 */
import type { GovernanceStatus } from "../supabase/types.js";
import type { HermesStore } from "./store.js";
import type { GovernanceAction, GovernanceTransitionInput, LearningCandidate } from "./types.js";

export class GovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernanceError";
  }
}

const GOVERNANCE_ROLES = new Set(["ADMIN", "COMPLIANCE_MANAGER"]);

// Naive `action.toLowerCase() + "d"` produces "reviewd"/"versiond"/"deployd"
// for the irregular ones — spelled out explicitly instead.
const AUDIT_ACTION_PAST_TENSE: Record<GovernanceAction, string> = {
  REVIEW: "reviewed",
  APPROVE: "approved",
  VERSION: "versioned",
  DEPLOY: "deployed",
  REJECT: "rejected",
};

const VALID_ACTIONS_FROM: Record<GovernanceStatus, GovernanceAction[]> = {
  PROPOSED: ["REVIEW", "REJECT"],
  REVIEW: ["APPROVE", "REJECT"],
  APPROVED: ["VERSION"],
  VERSIONED: ["DEPLOY"],
  DEPLOYED: [],
};

export async function transitionCandidate(
  store: HermesStore,
  organizationId: string,
  input: GovernanceTransitionInput
): Promise<LearningCandidate> {
  if (!GOVERNANCE_ROLES.has(input.actorRole)) {
    throw new GovernanceError(`Role ${input.actorRole} may not perform governance transitions`);
  }

  const candidate = await store.getLearningCandidate(organizationId, input.candidateId);
  if (!candidate) {
    throw new GovernanceError(`Learning candidate ${input.candidateId} not found`);
  }

  // Once rejected (REVIEW status + a rejection_reason already set), the
  // candidate is terminal — governance_status has no REJECTED value of its
  // own, so a prior rejection is represented this way. See module docstring.
  if (candidate.status === "REVIEW" && candidate.rejection_reason) {
    throw new GovernanceError(`Candidate ${input.candidateId} was already rejected`);
  }

  const allowed = VALID_ACTIONS_FROM[candidate.status];
  if (!allowed.includes(input.action)) {
    throw new GovernanceError(
      `Cannot ${input.action} a candidate in status ${candidate.status} (allowed: ${allowed.join(", ") || "none — terminal"})`
    );
  }

  if (input.action === "REJECT" && (!input.reason || input.reason.trim().length === 0)) {
    throw new GovernanceError("A reason is required to reject a candidate");
  }

  // Separation of duties: the person who proposed a candidate cannot also
  // approve or deploy it.
  if ((input.action === "APPROVE" || input.action === "DEPLOY") && candidate.proposed_by === input.actorId) {
    throw new GovernanceError("The proposer of a candidate cannot approve or deploy it themselves");
  }

  const now = new Date().toISOString();
  const patch = buildPatch(input.action, input.actorId, input.reason, now);

  const updated = await store.updateLearningCandidate(organizationId, input.candidateId, patch);

  await store.insertAuditLog({
    organization_id: organizationId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action: `learning_candidate_${AUDIT_ACTION_PAST_TENSE[input.action]}`,
    entity_type: "learning_candidate",
    entity_id: candidate.id,
    correlation_id: candidate.id,
    metadata: { fromStatus: candidate.status, toStatus: updated.status, reason: input.reason ?? null },
  });

  return updated;
}

function buildPatch(
  action: GovernanceAction,
  actorId: string,
  reason: string | undefined,
  now: string
): Partial<LearningCandidate> {
  switch (action) {
    case "REVIEW":
      return { status: "REVIEW", reviewed_by: actorId, reviewed_at: now };
    case "APPROVE":
      return { status: "APPROVED", approved_by: actorId, approved_at: now };
    case "VERSION":
      return { status: "VERSIONED", versioned_at: now };
    case "DEPLOY":
      return { status: "DEPLOYED", deployed_at: now };
    case "REJECT":
      return { status: "REVIEW", reviewed_by: actorId, reviewed_at: now, rejection_reason: reason ?? null };
  }
}
