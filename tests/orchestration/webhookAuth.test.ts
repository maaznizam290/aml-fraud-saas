import { describe, expect, it } from "vitest";
import { computeWebhookSignature, verifyWebhookSignature } from "../../lib/orchestration/webhookAuth.js";

describe("webhook signature verification", () => {
  const secret = "test-secret-value";
  const body = JSON.stringify({ alertId: "a1" });

  it("accepts a correctly computed signature", () => {
    const sig = computeWebhookSignature(secret, body);
    expect(verifyWebhookSignature(secret, body, sig)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const sig = computeWebhookSignature("wrong-secret", body);
    expect(verifyWebhookSignature(secret, body, sig)).toBe(false);
  });

  it("rejects a signature computed over a different body", () => {
    const sig = computeWebhookSignature(secret, body);
    expect(verifyWebhookSignature(secret, JSON.stringify({ alertId: "a2" }), sig)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(secret, body, null)).toBe(false);
  });

  it("rejects a malformed/truncated signature without throwing", () => {
    expect(verifyWebhookSignature(secret, body, "sha256=deadbeef")).toBe(false);
  });
});
