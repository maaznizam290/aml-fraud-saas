import { describe, expect, it } from "vitest";

import { HumanReviewError, resolveCase, submitHumanReview } from "../../lib/orchestration/humanReview.js";
import { NotificationDispatcher, createNoopNotifier } from "../../lib/orchestration/notifications/notifier.js";
import type { NotificationPayload, NotificationProvider } from "../../lib/orchestration/notifications/provider.js";
import { InMemoryOrchestrationStore } from "../../lib/orchestration/stores/inMemoryStore.js";
import { makeAlert, makeCustomer } from "./fixtures.js";

function seedStoreWithAlert(): InMemoryOrchestrationStore {
  const store = new InMemoryOrchestrationStore();
  store.seedCustomer(makeCustomer());
  store.seedAlert(makeAlert());
  return store;
}

async function seedRecommendation(store: InMemoryOrchestrationStore, disposition: "ESCALATE" | "CLEAR" | "REFER") {
  return store.insertRecommendation({
    organization_id: "org-test-0001",
    alert_id: "alert-test-0001",
    disposition,
    confidence: 0.7,
    risk_level: "MEDIUM",
    rationale: "test",
    red_flags: [],
    supporting_evidence: [],
    contradictory_evidence: [],
    recommended_next_steps: [],
    ml_score_assessment: "test",
    investigation_summary: "test",
    provider: "test",
    model_name: "test",
    prompt_version: "v1",
    metadata: {},
  });
}

describe("submitHumanReview", () => {
  it("required scenario: approval records the AI's disposition and agreedWithAi=true", async () => {
    const store = seedStoreWithAlert();
    await seedRecommendation(store, "ESCALATE");

    const result = await submitHumanReview(store, {
      alertId: "alert-test-0001",
      analystId: "analyst-1",
      action: "APPROVE",
      rationale: "Looks right to me.",
    });

    expect(result.decision).toBe("ESCALATE");
    expect(result.agreedWithAi).toBe(true);
    expect(result.overrideReason).toBeNull();

    const decisions = store.getAnalystDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.analyst_id).toBe("analyst-1");
    expect(decisions[0]?.ai_recommendation_id).not.toBeNull();
  });

  it("required scenario: rejection clears the alert and records disagreement", async () => {
    const store = seedStoreWithAlert();
    await seedRecommendation(store, "ESCALATE");

    const result = await submitHumanReview(store, {
      alertId: "alert-test-0001",
      analystId: "analyst-1",
      action: "REJECT",
      rationale: "False positive — verified with customer.",
    });

    expect(result.decision).toBe("CLEAR");
    expect(result.agreedWithAi).toBe(false);
    expect(result.overrideReason).toBe("False positive — verified with customer.");
  });

  it("required scenario: override records the analyst's chosen disposition, not the AI's", async () => {
    const store = seedStoreWithAlert();
    await seedRecommendation(store, "CLEAR");

    const result = await submitHumanReview(store, {
      alertId: "alert-test-0001",
      analystId: "analyst-1",
      action: "OVERRIDE",
      overrideDisposition: "ESCALATE",
      rationale: "Found additional context the AI didn't have.",
    });

    expect(result.decision).toBe("ESCALATE");
    expect(result.agreedWithAi).toBe(false);
  });

  it("rejects an OVERRIDE with no overrideDisposition", async () => {
    const store = seedStoreWithAlert();
    await seedRecommendation(store, "CLEAR");

    await expect(
      submitHumanReview(store, {
        alertId: "alert-test-0001",
        analystId: "analyst-1",
        action: "OVERRIDE",
        rationale: "missing disposition",
      })
    ).rejects.toThrow(HumanReviewError);
  });

  it("rejects a review with no rationale", async () => {
    const store = seedStoreWithAlert();
    await expect(
      submitHumanReview(store, { alertId: "alert-test-0001", analystId: "analyst-1", action: "APPROVE", rationale: "" })
    ).rejects.toThrow(HumanReviewError);
  });

  it("rejects a review for a nonexistent alert", async () => {
    const store = seedStoreWithAlert();
    await expect(
      submitHumanReview(store, { alertId: "does-not-exist", analystId: "analyst-1", action: "APPROVE", rationale: "x" })
    ).rejects.toThrow(HumanReviewError);
  });

  it("works even with no prior AI recommendation (defaults to REFER)", async () => {
    const store = seedStoreWithAlert();
    const result = await submitHumanReview(store, {
      alertId: "alert-test-0001",
      analystId: "analyst-1",
      action: "APPROVE",
      rationale: "manual review, no AI ran",
    });
    expect(result.decision).toBe("REFER");
  });
});

describe("resolveCase", () => {
  it("required scenario: resolves a case and moves the linked alert to RESOLVED", async () => {
    const store = seedStoreWithAlert();
    const { case: theCase } = await store.getOrCreateCase({
      organizationId: "org-test-0001",
      alertId: "alert-test-0001",
      customerId: "cust-test-0001",
      priority: "MEDIUM",
    });

    await resolveCase(store, createNoopNotifier(), {
      caseId: theCase.id,
      analystId: "analyst-1",
      disposition: "FALSE_POSITIVE",
      resolutionReason: "Verified legitimate transaction.",
    });

    const updatedCase = await store.getCase(theCase.id);
    expect(updatedCase?.status).toBe("RESOLVED");
    expect(updatedCase?.disposition).toBe("FALSE_POSITIVE");

    const alert = await store.getAlert("alert-test-0001");
    expect(alert?.status).toBe("RESOLVED");
    expect(alert?.resolved_at).not.toBeNull();
  });

  it("rejects resolving without a resolutionReason", async () => {
    const store = seedStoreWithAlert();
    const { case: theCase } = await store.getOrCreateCase({
      organizationId: "org-test-0001",
      alertId: "alert-test-0001",
      customerId: "cust-test-0001",
      priority: "MEDIUM",
    });

    await expect(
      resolveCase(store, createNoopNotifier(), {
        caseId: theCase.id,
        analystId: "analyst-1",
        disposition: "CLEARED",
        resolutionReason: "",
      })
    ).rejects.toThrow(HumanReviewError);
  });

  it("required scenario: a notification failure never blocks case resolution", async () => {
    const store = seedStoreWithAlert();
    const { case: theCase } = await store.getOrCreateCase({
      organizationId: "org-test-0001",
      alertId: "alert-test-0001",
      customerId: "cust-test-0001",
      priority: "MEDIUM",
    });

    class ThrowingNotifier implements NotificationProvider {
      readonly channelName = "throwing";
      async send(_payload: NotificationPayload): Promise<void> {
        throw new Error("Slack is down");
      }
    }
    const notifier = new NotificationDispatcher([new ThrowingNotifier()]);

    await expect(
      resolveCase(store, notifier, {
        caseId: theCase.id,
        analystId: "analyst-1",
        disposition: "CLEARED",
        resolutionReason: "Resolved despite notification outage.",
      })
    ).resolves.not.toThrow();

    const updatedCase = await store.getCase(theCase.id);
    expect(updatedCase?.status).toBe("RESOLVED");

    const actions = store.getAuditLogs().map((l) => l.action);
    expect(actions).toContain("notification_failed");
  });
});
