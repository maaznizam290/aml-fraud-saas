import { describe, expect, it } from "vitest";

import { NotificationDispatcher } from "../../lib/orchestration/notifications/notifier.js";
import type { NotificationPayload, NotificationProvider } from "../../lib/orchestration/notifications/provider.js";
import { InMemoryOrchestrationStore } from "../../lib/orchestration/stores/inMemoryStore.js";
import { makeAlert } from "./fixtures.js";

class RecordingProvider implements NotificationProvider {
  readonly channelName: string;
  sent: NotificationPayload[] = [];
  constructor(name: string) {
    this.channelName = name;
  }
  async send(payload: NotificationPayload): Promise<void> {
    this.sent.push(payload);
  }
}

class FailingProvider implements NotificationProvider {
  readonly channelName = "failing";
  async send(): Promise<void> {
    throw new Error("simulated outage");
  }
}

const ctx = { organizationId: "org-test-0001", actorId: null, actorRole: "SYSTEM", correlationId: "corr-1" };

describe("NotificationDispatcher", () => {
  it("required scenario: one provider failing does not stop another from sending", async () => {
    const store = new InMemoryOrchestrationStore();
    const good = new RecordingProvider("good");
    const dispatcher = new NotificationDispatcher([new FailingProvider(), good]);

    await dispatcher.notifyRecommendationReady(store, ctx, {
      alert: makeAlert(),
      caseId: "case-1",
      disposition: "REFER",
      riskLevel: "MEDIUM",
      summary: "test summary",
    });

    expect(good.sent).toHaveLength(1);
    const actions = store.getAuditLogs().map((l) => l.action);
    expect(actions).toContain("notification_sent");
    expect(actions).toContain("notification_failed");
  });

  it("never throws even when every provider fails", async () => {
    const store = new InMemoryOrchestrationStore();
    const dispatcher = new NotificationDispatcher([new FailingProvider(), new FailingProvider()]);

    await expect(
      dispatcher.notifyHumanReviewRequired(store, ctx, { alert: makeAlert(), caseId: "case-1" })
    ).resolves.not.toThrow();
  });

  it("persists an in-app notification only when a recipient is known", async () => {
    const store = new InMemoryOrchestrationStore();
    const dispatcher = new NotificationDispatcher([]);

    await dispatcher.notifyRecommendationReady(store, ctx, {
      alert: makeAlert({ assigned_analyst_id: null }),
      caseId: "case-1",
      disposition: "CLEAR",
      riskLevel: "LOW",
      summary: "no recipient",
    });
    expect(store.getNotifications()).toHaveLength(0);

    await dispatcher.notifyRecommendationReady(store, ctx, {
      alert: makeAlert({ assigned_analyst_id: "analyst-1" }),
      caseId: "case-2",
      disposition: "CLEAR",
      riskLevel: "LOW",
      summary: "has recipient",
    });
    expect(store.getNotifications()).toHaveLength(1);
  });
});
