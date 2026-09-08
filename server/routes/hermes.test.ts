import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { DEMO_ORG_ID, getStore, resetStoreForTests } from "../db.js";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.ANTHROPIC_API_KEY;

describe("POST /api/v1/hermes/rules/:id/promote — chief_compliance_officer guardrail", () => {
  beforeEach(() => {
    resetStoreForTests();
  });

  async function seedPendingRule() {
    const store = getStore();
    return store.createHermesRule({
      orgId: DEMO_ORG_ID,
      ruleName: "Test rule",
      conditions: { field: "amount_pkr", op: "gt", value: 1000 },
      accuracyRating: 0.9,
    });
  }

  it("rejects with 401 when x-user-id is missing", async () => {
    const rule = await seedPendingRule();
    const app = createApp();
    const response = await request(app).post(`/api/v1/hermes/rules/${rule.id}/promote`);
    expect(response.status).toBe(401);
  });

  it("rejects with 403 when the caller is an analyst, not a CCO", async () => {
    const rule = await seedPendingRule();
    const app = createApp();
    const response = await request(app)
      .post(`/api/v1/hermes/rules/${rule.id}/promote`)
      .set("x-user-id", "analyst-1");
    expect(response.status).toBe(403);

    const stillPending = await getStore().listHermesRules(DEMO_ORG_ID);
    expect(stillPending.find((r) => r.id === rule.id)?.status).toBe("PENDING");
  });

  it("promotes the rule to DEPLOYED when the caller is a chief_compliance_officer", async () => {
    const rule = await seedPendingRule();
    const app = createApp();
    const response = await request(app)
      .post(`/api/v1/hermes/rules/${rule.id}/promote`)
      .set("x-user-id", "cco-1");
    expect(response.status).toBe(200);
    expect(response.body.rule.status).toBe("DEPLOYED");
  });

  it("returns 404 for an unknown rule id", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/v1/hermes/rules/does-not-exist/promote")
      .set("x-user-id", "cco-1");
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/hermes/synthesize", () => {
  beforeEach(() => {
    resetStoreForTests();
  });

  it("returns an empty proposal list when there are no resolved alerts yet", async () => {
    const app = createApp();
    const response = await request(app).post("/api/v1/hermes/synthesize").send({});
    expect(response.status).toBe(200);
    expect(response.body.rules).toEqual([]);
  });

  it("creates PENDING rules from resolved alerts (template fallback, no ANTHROPIC_API_KEY)", async () => {
    const store = getStore();
    const transaction = await store.createTransaction({
      id: "txn_hermes_1",
      orgId: DEMO_ORG_ID,
      amountPkr: 90000,
      senderId: "s1",
      recipientId: "r1",
      deviceFingerprint: null,
      status: "BLOCKED",
      mlScore: 0.5,
      mlFeatures: { velocity_last_24h: 2, account_age_days: 1, device_risk_score: 0.7 },
    });
    const alert = await store.createAlert({
      orgId: DEMO_ORG_ID,
      transactionId: transaction.id,
      alertType: "ML_FLAGGED_SUSPICIOUS",
      riskLevel: "HIGH",
      hermesBrief: "brief",
    });
    await store.resolveAlert(alert.id, "RESOLVED_BLOCKED", "analyst-1");

    const app = createApp();
    const response = await request(app).post("/api/v1/hermes/synthesize").send({});

    expect(response.status).toBe(201);
    expect(response.body.rules.length).toBeGreaterThan(0);
    expect(response.body.rules[0].rule.status).toBe("PENDING");
    expect(response.body.rules[0].confusionMatrix).toBeDefined();
  });
});
