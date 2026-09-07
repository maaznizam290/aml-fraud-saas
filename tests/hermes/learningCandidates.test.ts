import { describe, expect, it } from "vitest";

import { ingestDecisionFeedback } from "../../lib/hermes/learningEvents.js";
import { generateCandidatesFromFeedback } from "../../lib/hermes/learningCandidates.js";
import { InMemoryHermesStore } from "../../lib/hermes/stores/inMemoryHermesStore.js";
import { makeDecisionContext, ORG_A } from "./fixtures.js";

describe("generateCandidatesFromFeedback", () => {
  it("required scenario: never proposes a candidate from a single feedback event (task section 8)", async () => {
    const store = new InMemoryHermesStore();
    await ingestDecisionFeedback(
      store,
      ORG_A,
      makeDecisionContext({ finalCaseDisposition: "FALSE_POSITIVE", analystDecisionId: "d-1" })
    );

    const candidates = await generateCandidatesFromFeedback(store, ORG_A);
    expect(candidates).toHaveLength(0);
  });

  it("proposes a FALSE_POSITIVE_PATTERN candidate once the threshold of recurring false positives is reached", async () => {
    const store = new InMemoryHermesStore();
    for (let i = 0; i < 3; i++) {
      await ingestDecisionFeedback(
        store,
        ORG_A,
        makeDecisionContext({ finalCaseDisposition: "FALSE_POSITIVE", analystDecisionId: `d-${i}` })
      );
    }

    const candidates = await generateCandidatesFromFeedback(store, ORG_A);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.improvement_type).toBe("FALSE_POSITIVE_PATTERN");
    expect(candidates[0]?.status).toBe("PROPOSED");
  });

  it("does not propose the same pattern twice while an equivalent candidate is still open", async () => {
    const store = new InMemoryHermesStore();
    for (let i = 0; i < 3; i++) {
      await ingestDecisionFeedback(
        store,
        ORG_A,
        makeDecisionContext({ finalCaseDisposition: "FALSE_POSITIVE", analystDecisionId: `d-${i}` })
      );
    }
    const first = await generateCandidatesFromFeedback(store, ORG_A);
    expect(first).toHaveLength(1);

    // One more false positive — still the same underlying pattern.
    await ingestDecisionFeedback(
      store,
      ORG_A,
      makeDecisionContext({ finalCaseDisposition: "FALSE_POSITIVE", analystDecisionId: "d-extra" })
    );
    const second = await generateCandidatesFromFeedback(store, ORG_A);
    expect(second).toHaveLength(0);

    const all = await store.listLearningCandidates(ORG_A);
    expect(all).toHaveLength(1);
  });
});
