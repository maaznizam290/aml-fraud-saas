import { describe, expect, it } from "vitest";

import { classifyLearningEvents, ingestDecisionFeedback } from "../../lib/hermes/learningEvents.js";
import { LocalHermesProvider } from "../../lib/hermes/providers/localHermesProvider.js";
import { InMemoryHermesStore } from "../../lib/hermes/stores/inMemoryHermesStore.js";
import { makeDecisionContext, ORG_A, ORG_B } from "./fixtures.js";

describe("classifyLearningEvents", () => {
  it("classifies a plain approval that agrees with the AI as ANALYST_APPROVAL only", () => {
    const events = classifyLearningEvents(makeDecisionContext());
    expect(events).toContain("ANALYST_APPROVAL");
    expect(events).not.toContain("AI_RECOMMENDATION_DISAGREEMENT");
    expect(events).not.toContain("ML_DISAGREEMENT");
  });

  it("classifies an override that disagrees with both the AI and a high ML score", () => {
    const events = classifyLearningEvents(
      makeDecisionContext({
        action: "OVERRIDE",
        decision: "CLEAR",
        agreedWithAi: false,
        aiDisposition: "ESCALATE",
        mlScore: 0.9,
      })
    );
    expect(events).toContain("ANALYST_OVERRIDE");
    expect(events).toContain("AI_RECOMMENDATION_DISAGREEMENT");
    expect(events).toContain("ML_DISAGREEMENT");
  });

  it("classifies a confirmed-fraud disposition as both CONFIRMED_SUSPICIOUS and INVESTIGATION_OUTCOME", () => {
    const events = classifyLearningEvents(makeDecisionContext({ finalCaseDisposition: "CONFIRMED_FRAUD" }));
    expect(events).toContain("CONFIRMED_SUSPICIOUS");
    expect(events).toContain("INVESTIGATION_OUTCOME");
  });

  it("classifies a false-positive disposition as FALSE_POSITIVE", () => {
    const events = classifyLearningEvents(makeDecisionContext({ finalCaseDisposition: "FALSE_POSITIVE" }));
    expect(events).toContain("FALSE_POSITIVE");
  });
});

describe("ingestDecisionFeedback", () => {
  it("required scenario: ingests feedback and records it against the right organization", async () => {
    const store = new InMemoryHermesStore();
    const { feedback, reused } = await ingestDecisionFeedback(store, ORG_A, makeDecisionContext());

    expect(reused).toBe(false);
    expect(feedback.organization_id).toBe(ORG_A);
    expect(feedback.alert_id).toBe("alert-test-0001");

    const auditActions = store.getAuditLogs().map((l) => l.action);
    expect(auditActions).toContain("hermes_learning_event");
  });

  it("required scenario: duplicate learning event — the same analystDecisionId is ingested only once", async () => {
    const store = new InMemoryHermesStore();
    const ctx = makeDecisionContext();

    const first = await ingestDecisionFeedback(store, ORG_A, ctx);
    const second = await ingestDecisionFeedback(store, ORG_A, ctx);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.feedback.id).toBe(first.feedback.id);

    const all = await store.listFeedback(ORG_A);
    expect(all).toHaveLength(1);
  });

  it("required scenario: tenant isolation — org B's feedback never appears in org A's list", async () => {
    const store = new InMemoryHermesStore();
    await ingestDecisionFeedback(store, ORG_A, makeDecisionContext({ organizationId: ORG_A }));
    await ingestDecisionFeedback(
      store,
      ORG_B,
      makeDecisionContext({ organizationId: ORG_B, analystDecisionId: "decision-org-b-0001" })
    );

    const orgAFeedback = await store.listFeedback(ORG_A);
    const orgBFeedback = await store.listFeedback(ORG_B);
    expect(orgAFeedback).toHaveLength(1);
    expect(orgBFeedback).toHaveLength(1);
    expect(orgAFeedback[0]?.id).not.toBe(orgBFeedback[0]?.id);
  });
});

describe("LocalHermesProvider.ingestFeedback", () => {
  it("never throws even when given an unusual context shape", async () => {
    const store = new InMemoryHermesStore();
    const provider = new LocalHermesProvider(store);
    const result = await provider.ingestFeedback(ORG_A, makeDecisionContext({ rationale: "" }));
    expect(result.ok).toBe(true);
  });
});
