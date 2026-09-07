import { describe, expect, it } from "vitest";

import { activateSkill, proposeSkill, SkillConflictError } from "../../lib/hermes/skills.js";
import { transitionCandidate } from "../../lib/hermes/governance.js";
import { LocalHermesProvider } from "../../lib/hermes/providers/localHermesProvider.js";
import { InMemoryHermesStore } from "../../lib/hermes/stores/inMemoryHermesStore.js";
import { ORG_A, ORG_B } from "./fixtures.js";

const SKILL_INPUT = {
  name: "high-velocity-investigation",
  description: "Investigate rapid successive transactions from one customer.",
  version: "1.0.0",
  proposedBy: "analyst-1",
};

describe("proposeSkill", () => {
  it("required scenario: proposes a new skill as DRAFT/PROPOSED", async () => {
    const store = new InMemoryHermesStore();
    const skill = await proposeSkill(store, ORG_A, SKILL_INPUT);
    expect(skill.status).toBe("DRAFT");
    expect(skill.governance_state).toBe("PROPOSED");
    expect(skill.version).toBe("1.0.0");
  });

  it("required scenario: skill versioning — the same (name, version) pair cannot be proposed twice", async () => {
    const store = new InMemoryHermesStore();
    await proposeSkill(store, ORG_A, SKILL_INPUT);
    await expect(proposeSkill(store, ORG_A, SKILL_INPUT)).rejects.toThrow(SkillConflictError);
  });

  it("allows the same name with a bumped version", async () => {
    const store = new InMemoryHermesStore();
    await proposeSkill(store, ORG_A, SKILL_INPUT);
    const v2 = await proposeSkill(store, ORG_A, { ...SKILL_INPUT, version: "1.1.0" });
    expect(v2.version).toBe("1.1.0");
  });

  it("tenant isolation: the same (name, version) can be proposed independently in a different org", async () => {
    const store = new InMemoryHermesStore();
    await proposeSkill(store, ORG_A, SKILL_INPUT);
    await expect(proposeSkill(store, ORG_B, SKILL_INPUT)).resolves.toMatchObject({ version: "1.0.0" });
  });
});

describe("activateSkill", () => {
  it("refuses to activate a skill before its governance_state reaches DEPLOYED", async () => {
    const store = new InMemoryHermesStore();
    const skill = await proposeSkill(store, ORG_A, SKILL_INPUT);
    await expect(activateSkill(store, ORG_A, skill.id, "admin-1")).rejects.toThrow(SkillConflictError);
  });

  it("activates a skill once its governance_state is DEPLOYED", async () => {
    const store = new InMemoryHermesStore();
    const skill = await proposeSkill(store, ORG_A, SKILL_INPUT);
    await store.updateSkill(ORG_A, skill.id, { governance_state: "DEPLOYED" });

    const activated = await activateSkill(store, ORG_A, skill.id, "admin-1");
    expect(activated.status).toBe("ACTIVE");
  });
});

describe("LocalHermesProvider skill listing respects governance filters", () => {
  it("get_approved_skills-style query only returns DEPLOYED skills", async () => {
    const store = new InMemoryHermesStore();
    const provider = new LocalHermesProvider(store);
    const proposed = await provider.proposeSkill(ORG_A, SKILL_INPUT);
    expect(proposed.ok).toBe(true);

    const deployedOnly = await provider.listSkills(ORG_A, { governanceState: "DEPLOYED" });
    expect(deployedOnly.ok).toBe(true);
    if (!deployedOnly.ok) return;
    expect(deployedOnly.data).toHaveLength(0);
  });
});

// Sanity check that governance.ts and skills.ts agree on the vocabulary a
// skill's governance_state can reach — used by activateSkill's gate above.
describe("governance vocabulary used by skills", () => {
  it("DEPLOYED is a valid terminal transition target", async () => {
    const store = new InMemoryHermesStore();
    const candidate = await store.insertLearningCandidate({
      organization_id: ORG_A,
      improvement_type: "SKILL_REFINEMENT",
      title: "test",
      description: "test",
      payload: {},
      supporting_feedback_ids: [],
      status: "VERSIONED",
      related_skill_id: null,
      related_model_version_id: null,
      related_rule_version_id: null,
      proposed_by: "analyst-1",
      reviewed_by: "admin-1",
      reviewed_at: new Date().toISOString(),
      approved_by: "admin-1",
      approved_at: new Date().toISOString(),
      versioned_at: new Date().toISOString(),
      deployed_at: null,
      rejection_reason: null,
    });

    const deployed = await transitionCandidate(store, ORG_A, {
      candidateId: candidate.id,
      action: "DEPLOY",
      actorId: "admin-2",
      actorRole: "ADMIN",
    });
    expect(deployed.status).toBe("DEPLOYED");
  });
});
