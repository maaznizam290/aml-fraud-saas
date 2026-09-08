import { describe, expect, it } from "vitest";
import { scoreViaFallbackHeuristic } from "./mlClient.js";

describe("scoreViaFallbackHeuristic", () => {
  it("flags large amount + very new account as risky (SUSPICIOUS band)", () => {
    const result = scoreViaFallbackHeuristic({
      transactionId: "t1",
      amountPkr: 75000,
      velocity_last_24h: 2,
      account_age_days: 1,
      device_risk_score: 0.5,
    });
    expect(result.source).toBe("fallback-heuristic");
    expect(result.fraudProbability).toBeGreaterThan(0.35);
    expect(result.fraudProbability).toBeLessThan(0.85);
  });

  it("never auto-resolves to the BLOCKED band on its own", () => {
    const result = scoreViaFallbackHeuristic({
      transactionId: "t2",
      amountPkr: 500000,
      velocity_last_24h: 10,
      account_age_days: 0,
      device_risk_score: 1,
    });
    expect(result.fraudProbability).toBeLessThan(0.85);
  });

  it("treats a small amount from an old account as low risk", () => {
    const result = scoreViaFallbackHeuristic({
      transactionId: "t3",
      amountPkr: 2000,
      velocity_last_24h: 1,
      account_age_days: 500,
      device_risk_score: 0.05,
    });
    expect(result.fraudProbability).toBeLessThanOrEqual(0.35);
  });
});
