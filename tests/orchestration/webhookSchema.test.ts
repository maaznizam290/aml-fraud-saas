import { describe, expect, it } from "vitest";
import { alertWebhookSchema } from "../../lib/orchestration/webhookSchema.js";

const VALID_PAYLOAD = {
  alertId: "alert-1",
  organizationId: "org-1",
  customerId: "cust-1",
  transactionId: "txn-1",
  alertType: "VELOCITY_ANOMALY",
  severity: "HIGH",
  triggeredRules: ["RULE_1"],
  riskScore: 0.8,
  mlScore: null,
  source: "RULE_ENGINE",
  occurredAt: "2024-06-01T12:00:00.000Z",
};

describe("alertWebhookSchema", () => {
  it("accepts a fully valid payload", () => {
    const result = alertWebhookSchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it("fills in defaults for optional fields", () => {
    const { alertId, organizationId, customerId, alertType, severity, occurredAt } = VALID_PAYLOAD;
    const result = alertWebhookSchema.safeParse({ alertId, organizationId, customerId, alertType, severity, occurredAt });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transactionId).toBeNull();
      expect(result.data.triggeredRules).toEqual([]);
      expect(result.data.riskScore).toBeNull();
    }
  });

  it("rejects a payload missing a required field", () => {
    const { alertId: _drop, ...rest } = VALID_PAYLOAD;
    const result = alertWebhookSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid alertType enum value", () => {
    const result = alertWebhookSchema.safeParse({ ...VALID_PAYLOAD, alertType: "NOT_A_REAL_TYPE" });
    expect(result.success).toBe(false);
  });

  it("rejects a riskScore outside [0, 1]", () => {
    const result = alertWebhookSchema.safeParse({ ...VALID_PAYLOAD, riskScore: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a completely malformed payload", () => {
    const result = alertWebhookSchema.safeParse({ garbage: true });
    expect(result.success).toBe(false);
  });
});
