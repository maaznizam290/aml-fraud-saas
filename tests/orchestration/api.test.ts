import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetDemoStoreForTests } from "../../lib/orchestration/runtime.js";
import { DEMO_ALERT_ID } from "../../lib/orchestration/stores/inMemoryStore.js";
import { GET as getInvestigation } from "../../app/api/investigations/[alertId]/route.js";
import { POST as postReview } from "../../app/api/investigations/[alertId]/review/route.js";
import { POST as postWebhook } from "../../app/api/webhooks/aml-fraud-alert/route.js";
import { POST as postResolve } from "../../app/api/cases/[caseId]/resolve/route.js";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/webhooks/aml-fraud-alert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const VALID_DEMO_WEBHOOK_BODY = {
  alertId: DEMO_ALERT_ID,
  organizationId: "00000000-0000-0000-0000-0000000000d0",
  customerId: "demo-customer-0001",
  transactionId: "demo-txn-0008",
  alertType: "VELOCITY_ANOMALY",
  severity: "HIGH",
  triggeredRules: ["RULE_VELOCITY_8_IN_2H"],
  riskScore: 0.81,
  mlScore: null,
  source: "RULE_ENGINE",
  occurredAt: new Date().toISOString(),
};

describe("API routes (DEMO mode)", () => {
  beforeEach(() => {
    delete process.env["ORCHESTRATION_MODE"];
    resetDemoStoreForTests();
  });
  afterEach(() => {
    resetDemoStoreForTests();
  });

  it("required scenario: valid alert webhook returns 202 and a disposition", async () => {
    const response = await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    expect(response.status).toBe(202);
    const body = await readJson(response);
    expect(body.status).toBe("HUMAN_REVIEW");
    expect(["ESCALATE", "CLEAR", "REFER"]).toContain(body.disposition);
  });

  it("required scenario: invalid alert payload returns 400", async () => {
    const response = await postWebhook(jsonRequest({ garbage: true }));
    expect(response.status).toBe(400);
  });

  it("returns 404 for an alert id the store has never heard of", async () => {
    const response = await postWebhook(jsonRequest({ ...VALID_DEMO_WEBHOOK_BODY, alertId: "does-not-exist" }));
    expect(response.status).toBe(404);
  });

  it("required scenario: duplicate webhook is idempotent", async () => {
    const first = await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const firstBody = await readJson(first);
    expect(firstBody.reused).toBe(false);

    const second = await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const secondBody = await readJson(second);
    expect(second.status).toBe(200);
    expect(secondBody.reused).toBe(true);
    expect(secondBody.recommendationId).toBe(firstBody.recommendationId);
  });

  it("GET status reflects the investigation lifecycle", async () => {
    await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const response = await getInvestigation(new Request("http://localhost"), {
      params: { alertId: DEMO_ALERT_ID },
    });
    const body = await readJson(response);
    expect(body.status).toBe("HUMAN_REVIEW");
    expect(body.recommendation).not.toBeNull();
  });

  it("required scenario: human approval via the API", async () => {
    await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const response = await postReview(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ analystId: "analyst-1", action: "APPROVE", rationale: "Confirmed via phone call." }),
      }),
      { params: { alertId: DEMO_ALERT_ID } }
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.agreedWithAi).toBe(true);
  });

  it("required scenario: rejection via the API", async () => {
    await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const response = await postReview(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ analystId: "analyst-1", action: "REJECT", rationale: "False positive." }),
      }),
      { params: { alertId: DEMO_ALERT_ID } }
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.decision).toBe("CLEAR");
  });

  it("review rejects a missing rationale with 400", async () => {
    await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const response = await postReview(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ analystId: "a1", action: "APPROVE" }) }),
      { params: { alertId: DEMO_ALERT_ID } }
    );
    expect(response.status).toBe(400);
  });

  it("required scenario: full lifecycle through resolution via the API", async () => {
    const webhookResp = await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    const caseId = (await readJson(webhookResp)).caseId as string;

    await postReview(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ analystId: "analyst-1", action: "APPROVE", rationale: "Reviewed." }),
      }),
      { params: { alertId: DEMO_ALERT_ID } }
    );

    const resolveResp = await postResolve(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          analystId: "analyst-1",
          disposition: "CONFIRMED_FRAUD",
          resolutionReason: "Confirmed with customer this was unauthorized.",
        }),
      }),
      { params: { caseId } }
    );
    expect(resolveResp.status).toBe(200);

    const statusResp = await getInvestigation(new Request("http://localhost"), { params: { alertId: DEMO_ALERT_ID } });
    const statusBody = await readJson(statusResp);
    expect(statusBody.status).toBe("RESOLVED");
  });
});

describe("API routes (REAL mode webhook signature enforcement)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env["ORCHESTRATION_MODE"] = "REAL";
    process.env["AML_WEBHOOK_SECRET"] = "test-secret";
    process.env["ANTHROPIC_API_KEY"] = "sk-test-fake-key-for-construction-only";
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://example-project.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("required scenario: missing signature is rejected with 401 before any investigation logic runs", async () => {
    const response = await postWebhook(jsonRequest(VALID_DEMO_WEBHOOK_BODY));
    expect(response.status).toBe(401);
  });

  it("required scenario: an incorrect signature is rejected with 401", async () => {
    const request = new Request("http://localhost/api/webhooks/aml-fraud-alert", {
      method: "POST",
      headers: { "x-aml-signature": "sha256=wrongvalue" },
      body: JSON.stringify(VALID_DEMO_WEBHOOK_BODY),
    });
    const response = await postWebhook(request);
    expect(response.status).toBe(401);
  });
});
