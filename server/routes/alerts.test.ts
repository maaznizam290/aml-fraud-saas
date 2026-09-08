import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { DEMO_ORG_ID, getStore, resetStoreForTests } from "../db.js";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("alerts routes", () => {
  beforeEach(() => {
    resetStoreForTests();
  });

  it("returns 404 for an unknown alert id", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/alerts/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("not found");
  });

  it("resolves an OPEN alert and moves the linked transaction to a final state", async () => {
    const store = getStore();
    const transaction = await store.createTransaction({
      id: "txn_test_1",
      orgId: DEMO_ORG_ID,
      amountPkr: 60000,
      senderId: "s1",
      recipientId: "r1",
      deviceFingerprint: null,
      status: "PENDING_REVIEW",
      mlScore: 0.5,
      mlFeatures: { velocity_last_24h: 1, account_age_days: 1, device_risk_score: 0.5 },
    });
    const alert = await store.createAlert({
      orgId: DEMO_ORG_ID,
      transactionId: transaction.id,
      alertType: "ML_FLAGGED_SUSPICIOUS",
      riskLevel: "MEDIUM",
      hermesBrief: "test brief",
    });

    const app = createApp();
    const response = await request(app)
      .post(`/api/v1/alerts/${alert.id}/resolve`)
      .set("x-user-id", "analyst-1")
      .send({ decision: "BLOCK" });

    expect(response.status).toBe(200);
    expect(response.body.alert.status).toBe("RESOLVED_BLOCKED");
    expect(response.body.alert.assigned_analyst).toBe("analyst-1");

    const updatedTransaction = await store.getTransaction(transaction.id);
    expect(updatedTransaction?.status).toBe("BLOCKED");
  });

  it("rejects an invalid decision value", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/v1/alerts/some-id/resolve")
      .send({ decision: "MAYBE" });
    expect(response.status).toBe(400);
  });
});
