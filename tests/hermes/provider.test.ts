import { describe, expect, it } from "vitest";

import { LocalHermesProvider } from "../../lib/hermes/providers/localHermesProvider.js";
import { UnavailableHermesProvider } from "../../lib/hermes/providers/unavailableHermesProvider.js";
import type { HermesStore } from "../../lib/hermes/store.js";
import { ORG_A } from "./fixtures.js";
import { makeDecisionContext } from "./fixtures.js";

describe("UnavailableHermesProvider", () => {
  it("required scenario: failed Hermes connection — every method degrades instead of throwing", async () => {
    const provider = new UnavailableHermesProvider("simulated outage");
    expect(provider.available).toBe(false);

    const results = await Promise.all([
      provider.retrieveMemories(ORG_A, {}),
      provider.createMemory(ORG_A, { category: "SEMANTIC", content: {} }),
      provider.retrieveInstitutionalKnowledge(ORG_A),
      provider.ingestFeedback(ORG_A, makeDecisionContext()),
      provider.listFeedback(ORG_A),
      provider.listSkills(ORG_A),
      provider.proposeSkill(ORG_A, {
        name: "x",
        description: "x",
        version: "1.0.0",
        proposedBy: "analyst-1",
      }),
      provider.proposeCandidate(ORG_A, {
        improvementType: "FALSE_POSITIVE_PATTERN",
        title: "x",
        description: "x",
        payload: {},
        proposedBy: "analyst-1",
      }),
      provider.listCandidates(ORG_A),
      provider.transitionCandidate(ORG_A, {
        candidateId: "does-not-matter",
        action: "REVIEW",
        actorId: "compliance-1",
        actorRole: "COMPLIANCE_MANAGER",
      }),
      provider.generateCandidatesFromFeedback(ORG_A),
    ]);

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.degraded).toBe(true);
        expect(result.error).toContain("simulated outage");
      }
    }
  });
});

describe("LocalHermesProvider malformed/failing store responses", () => {
  it("required scenario: a store that throws is degraded gracefully, never thrown from the provider", async () => {
    const brokenStore: HermesStore = {
      insertMemory: () => Promise.reject(new Error("connection reset")),
      queryMemories: () => Promise.reject("not even an Error instance"),
      getMemory: () => Promise.resolve(null),
      listSkills: () => Promise.reject(new Error("malformed response")),
      getSkillByNameVersion: () => Promise.resolve(null),
      insertSkill: () => Promise.reject(new Error("malformed response")),
      updateSkill: () => Promise.reject(new Error("not found")),
      insertFeedback: () => Promise.reject(new Error("malformed response")),
      listFeedback: () => Promise.reject(new Error("malformed response")),
      findFeedbackByDecisionId: () => Promise.reject(new Error("malformed response")),
      listModelVersions: () => Promise.resolve([]),
      listRuleVersions: () => Promise.resolve([]),
      insertLearningCandidate: () => Promise.reject(new Error("malformed response")),
      getLearningCandidate: () => Promise.resolve(null),
      listLearningCandidates: () => Promise.reject(new Error("malformed response")),
      updateLearningCandidate: () => Promise.reject(new Error("not found")),
      insertAuditLog: () =>
        Promise.resolve({
          id: "audit-1",
          organization_id: ORG_A,
          actor_id: null,
          actor_role: null,
          action: "x",
          entity_type: "x",
          entity_id: null,
          correlation_id: null,
          metadata: {},
          created_at: new Date().toISOString(),
        }),
    };

    const provider = new LocalHermesProvider(brokenStore);

    const memoryResult = await provider.retrieveMemories(ORG_A, {});
    expect(memoryResult.ok).toBe(false);
    if (!memoryResult.ok) {
      expect(memoryResult.degraded).toBe(true);
      // The rejection wasn't even an Error instance — the provider must
      // still produce a readable string, not crash on `err.message`.
      expect(memoryResult.error).toContain("not even an Error instance");
    }

    const skillsResult = await provider.listSkills(ORG_A);
    expect(skillsResult.ok).toBe(false);

    const candidatesResult = await provider.listCandidates(ORG_A);
    expect(candidatesResult.ok).toBe(false);
  });
});
