import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetStoreForTests } from "../db.js";

process.env.ML_ENGINE_URL = "http://127.0.0.1:1";
process.env.ML_ENGINE_TIMEOUT_MS = "200";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("POST /api/v1/fraud/evaluate", () => {
  beforeEach(() => {
    resetStoreForTests();
  });

  it("auto-approves a low-risk transaction with no alert (falls back — ML engine unreachable in tests)", async () => {
    const app = createApp();
    const response = await request(app).post("/api/v1/fraud/evaluate").send({
      amountPkr: 2000,
      senderId: "s1",
      recipientId: "r1",
      velocityLast24h: 1,
      accountAgeDays: 500,
      deviceRiskScore: 0.05,
    });

    expect(response.status).toBe(201);
    expect(response.body.transaction.status).toBe("APPROVED");
    expect(response.body.alert).toBeNull();
    expect(response.body.scoreSource).toBe("fallback-heuristic");
  });

  it("freezes a structurally risky transaction into PENDING_REVIEW with an alert", async () => {
    const app = createApp();
    const response = await request(app).post("/api/v1/fraud/evaluate").send({
      amountPkr: 75000,
      senderId: "s2",
      recipientId: "r2",
      velocityLast24h: 3,
      accountAgeDays: 1,
      deviceRiskScore: 0.6,
    });

    expect(response.status).toBe(201);
    expect(response.body.transaction.status).toBe("PENDING_REVIEW");
    expect(response.body.alert).not.toBeNull();
    expect(response.body.alert.status).toBe("OPEN");
  });

  it("rejects an invalid request body", async () => {
    const app = createApp();
    const response = await request(app).post("/api/v1/fraud/evaluate").send({ amountPkr: -5 });
    expect(response.status).toBe(400);
  });
});
