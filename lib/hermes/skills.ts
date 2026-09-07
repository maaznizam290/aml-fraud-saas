/**
 * Skill management (task section 7). Mirrors the "never silently replace a
 * version" rule from feature/fraud-detection-engine's ModelRegistry
 * (ml-engine/src/fraud_ml/models/registry.py) — proposing a
 * (name, version) pair that already exists is a conflict, not a silent
 * overwrite, because the version number is exactly what a case's audit
 * trail cites ("investigated using skill X v1.2.0").
 */
import type { HermesStore } from "./store.js";
import type { AgentSkill, ProposeSkillInput } from "./types.js";
import type { Json } from "../supabase/types.js";

export class SkillConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillConflictError";
  }
}

export async function proposeSkill(
  store: HermesStore,
  organizationId: string,
  input: ProposeSkillInput
): Promise<AgentSkill> {
  const existing = await store.getSkillByNameVersion(organizationId, input.name, input.version);
  if (existing) {
    throw new SkillConflictError(
      `Skill "${input.name}" version ${input.version} already exists (id ${existing.id}) — bump the version instead of reusing it.`
    );
  }

  const skill = await store.insertSkill({
    organization_id: organizationId,
    name: input.name,
    description: input.description,
    version: input.version,
    status: "DRAFT",
    source: input.source ?? "learned",
    governance_state: "PROPOSED",
    approved_by: null,
    approved_at: null,
    metadata: (input.metadata ?? {}) as Json,
  });

  await store.insertAuditLog({
    organization_id: organizationId,
    actor_id: input.proposedBy,
    actor_role: null,
    action: "skill_proposed",
    entity_type: "agent_skill",
    entity_id: skill.id,
    correlation_id: skill.id,
    metadata: { name: input.name, version: input.version },
  });

  return skill;
}

/**
 * Marks a skill ACTIVE once its governance_state has independently reached
 * DEPLOYED via governance.ts (skills use the same PROPOSED..DEPLOYED
 * vocabulary as learning_candidates for governance_state, but track their
 * own DRAFT/ACTIVE/DEPRECATED lifecycle in `status` — the two are related
 * but not identical, since a skill can be governance-DEPLOYED and later
 * operationally DEPRECATED without losing that approval history).
 */
export async function activateSkill(
  store: HermesStore,
  organizationId: string,
  skillId: string,
  actorId: string
): Promise<AgentSkill> {
  const skills = await store.listSkills(organizationId);
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) throw new SkillConflictError(`Skill ${skillId} not found`);
  if (skill.governance_state !== "DEPLOYED") {
    throw new SkillConflictError(
      `Skill ${skillId} cannot be activated before its governance_state reaches DEPLOYED (currently ${skill.governance_state})`
    );
  }

  const updated = await store.updateSkill(organizationId, skillId, { status: "ACTIVE" });

  await store.insertAuditLog({
    organization_id: organizationId,
    actor_id: actorId,
    actor_role: null,
    action: "skill_activated",
    entity_type: "agent_skill",
    entity_id: skillId,
    correlation_id: skillId,
    metadata: {},
  });

  return updated;
}
