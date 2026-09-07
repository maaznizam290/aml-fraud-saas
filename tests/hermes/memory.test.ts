import { describe, expect, it } from "vitest";

import { LocalHermesProvider } from "../../lib/hermes/providers/localHermesProvider.js";
import { InMemoryHermesStore } from "../../lib/hermes/stores/inMemoryHermesStore.js";
import { ORG_A, ORG_B } from "./fixtures.js";

describe("LocalHermesProvider memory", () => {
  it("required scenario: creates a memory and retrieves it back", async () => {
    const store = new InMemoryHermesStore();
    const provider = new LocalHermesProvider(store);

    const created = await provider.createMemory(ORG_A, {
      category: "SEMANTIC",
      subjectType: "alert_type",
      subjectId: "VELOCITY_ANOMALY",
      content: { pattern: "8+ transactions in 2 hours is usually legitimate payroll batching" },
      confidence: 0.6,
      source: "analyst-observation",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.category).toBe("SEMANTIC");
    expect(created.data.organization_id).toBe(ORG_A);

    const retrieved = await provider.retrieveMemories(ORG_A, { category: "SEMANTIC" });
    expect(retrieved.ok).toBe(true);
    if (!retrieved.ok) return;
    expect(retrieved.data).toHaveLength(1);
    expect(retrieved.data[0]?.id).toBe(created.data.id);
  });

  it("retrieveInstitutionalKnowledge only returns INSTITUTIONAL-category memories", async () => {
    const store = new InMemoryHermesStore();
    const provider = new LocalHermesProvider(store);

    await provider.createMemory(ORG_A, { category: "EPISODIC", content: { note: "one-off case detail" } });
    await provider.createMemory(ORG_A, {
      category: "INSTITUTIONAL",
      subjectType: "policy",
      content: { note: "org always escalates structuring patterns regardless of amount" },
    });

    const result = await provider.retrieveInstitutionalKnowledge(ORG_A);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.category).toBe("INSTITUTIONAL");
  });

  it("required scenario: tenant isolation — org B never sees org A's memories", async () => {
    const store = new InMemoryHermesStore();
    const provider = new LocalHermesProvider(store);

    await provider.createMemory(ORG_A, { category: "SEMANTIC", content: { secret: "org-a-only" } });

    const orgBResult = await provider.retrieveMemories(ORG_B, {});
    expect(orgBResult.ok).toBe(true);
    if (!orgBResult.ok) return;
    expect(orgBResult.data).toHaveLength(0);

    const orgAResult = await provider.retrieveMemories(ORG_A, {});
    expect(orgAResult.ok).toBe(true);
    if (!orgAResult.ok) return;
    expect(orgAResult.data).toHaveLength(1);
  });
});
