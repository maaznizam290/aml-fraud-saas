import { describe, expect, it } from "vitest";

import { GovernanceError, transitionCandidate } from "../../lib/hermes/governance.js";
import { InMemoryHermesStore } from "../../lib/hermes/stores/inMemoryHermesStore.js";
import type { LearningCandidate } from "../../lib/hermes/types.js";
import { ORG_A, ORG_B } from "./fixtures.js";

async function seedCandidate(store: InMemoryHermesStore, overrides: Partial<LearningCandidate> = {}) {
  return store.insertLearningCandidate({
    organization_id: ORG_A,
    improvement_type: "FALSE_POSITIVE_PATTERN",
    title: "Recurring false positive",
    description: "test",
    payload: {},
    supporting_feedback_ids: [],
    status: "PROPOSED",
    related_skill_id: null,
    related_model_version_id: null,
    related_rule_version_id: null,
    proposed_by: "analyst-1",
    reviewed_by: null,
    reviewed_at: null,
    approved_by: null,
    approved_at: null,
    versioned_at: null,
    deployed_at: null,
    rejection_reason: null,
    ...overrides,
  });
}

describe("transitionCandidate", () => {
  it("required scenario: walks the full PROPOSED -> REVIEW -> APPROVED -> VERSIONED -> DEPLOYED lifecycle", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store);

    const reviewed = await transitionCandidate(store, ORG_A, {
      candidateId: candidate.id,
      action: "REVIEW",
      actorId: "compliance-1",
      actorRole: "COMPLIANCE_MANAGER",
    });
    expect(reviewed.status).toBe("REVIEW");

    const approved = await transitionCandidate(store, ORG_A, {
      candidateId: candidate.id,
      action: "APPROVE",
      actorId: "compliance-1",
      actorRole: "COMPLIANCE_MANAGER",
    });
    expect(approved.status).toBe("APPROVED");

    const versioned = await transitionCandidate(store, ORG_A, {
      candidateId: candidate.id,
      action: "VERSION",
      actorId: "compliance-1",
      actorRole: "COMPLIANCE_MANAGER",
    });
    expect(versioned.status).toBe("VERSIONED");

    const deployed = await transitionCandidate(store, ORG_A, {
      candidateId: candidate.id,
      action: "DEPLOY",
      actorId: "compliance-1",
      actorRole: "COMPLIANCE_MANAGER",
    });
    expect(deployed.status).toBe("DEPLOYED");

    const auditActions = store.getAuditLogs().map((l) => l.action);
    expect(auditActions).toEqual([
      "learning_candidate_reviewed",
      "learning_candidate_approved",
      "learning_candidate_versioned",
      "learning_candidate_deployed",
    ]);
  });

  it("required scenario: unauthorized access — an ANALYST cannot perform a governance transition", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store);

    await expect(
      transitionCandidate(store, ORG_A, {
        candidateId: candidate.id,
        action: "REVIEW",
        actorId: "analyst-1",
        actorRole: "ANALYST",
      })
    ).rejects.toThrow(GovernanceError);
  });

  it("rejects skipping a step (PROPOSED straight to APPROVED)", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store);

    await expect(
      transitionCandidate(store, ORG_A, {
        candidateId: candidate.id,
        action: "APPROVE",
        actorId: "compliance-1",
        actorRole: "COMPLIANCE_MANAGER",
      })
    ).rejects.toThrow(GovernanceError);
  });

  it("enforces separation of duties — the proposer cannot approve their own candidate", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store, { status: "REVIEW", proposed_by: "compliance-1" });

    await expect(
      transitionCandidate(store, ORG_A, {
        candidateId: candidate.id,
        action: "APPROVE",
        actorId: "compliance-1",
        actorRole: "COMPLIANCE_MANAGER",
      })
    ).rejects.toThrow(GovernanceError);
  });

  it("requires a reason to reject", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store);

    await expect(
      transitionCandidate(store, ORG_A, {
        candidateId: candidate.id,
        action: "REJECT",
        actorId: "compliance-1",
        actorRole: "COMPLIANCE_MANAGER",
      })
    ).rejects.toThrow(GovernanceError);
  });

  it("a rejected candidate is terminal — no further transitions are allowed", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store);

    const rejected = await transitionCandidate(store, ORG_A, {
      candidateId: candidate.id,
      action: "REJECT",
      actorId: "compliance-1",
      actorRole: "COMPLIANCE_MANAGER",
      reason: "Not a real pattern — coincidental.",
    });
    expect(rejected.status).toBe("REVIEW");
    expect(rejected.rejection_reason).toBe("Not a real pattern — coincidental.");

    await expect(
      transitionCandidate(store, ORG_A, {
        candidateId: candidate.id,
        action: "REVIEW",
        actorId: "compliance-1",
        actorRole: "COMPLIANCE_MANAGER",
      })
    ).rejects.toThrow(GovernanceError);
  });

  it("required scenario: tenant isolation — a candidate from another org is reported as not found, not transitioned", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await seedCandidate(store);

    await expect(
      transitionCandidate(store, ORG_B, {
        candidateId: candidate.id,
        action: "REVIEW",
        actorId: "compliance-1",
        actorRole: "COMPLIANCE_MANAGER",
      })
    ).rejects.toThrow(GovernanceError);
  });
});
