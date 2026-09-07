import { describe, expect, it } from "vitest";
import { collectEvidence } from "../../lib/orchestration/evidence.js";
import { InMemoryOrchestrationStore } from "../../lib/orchestration/stores/inMemoryStore.js";
import { makeAlert, makeCustomer, makeCustomerProfile, makeTransaction } from "./fixtures.js";

function fetchReturning(body: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;
}

const ML_SUCCESS_BODY = {
  status: "ok",
  risk_signals: [{ signal_type: "AMOUNT_ANOMALY", triggered: true, weight: 0.8, explanation: "large amount" }],
  ml_prediction: {
    provider: "local",
    model_name: "xgboost-fraud",
    model_version: "1.0.0",
    prediction: "FRAUD_LIKELY",
    score: 0.7,
    confidence: null,
  },
  risk_assessment: { disposition: "REFER", risk_level: "MEDIUM", rationale: "test", ml_contributed: true },
  errors: [],
};

describe("collectEvidence", () => {
  it("collects all evidence categories for a normal alert", async () => {
    const store = new InMemoryOrchestrationStore();
    store.seedCustomer(makeCustomer());
    store.seedCustomerProfile(makeCustomerProfile());
    store.seedTransaction(makeTransaction());
    const alert = makeAlert();

    const evidence = await collectEvidence(store, alert, {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchReturning(ML_SUCCESS_BODY),
    });

    const categories = new Set(evidence.items.map((i) => i.category));
    expect(categories).toContain("TRANSACTION_HISTORY");
    expect(categories).toContain("CUSTOMER_PROFILE");
    expect(categories).toContain("KYC_STATUS");
    expect(categories).toContain("SANCTIONS_RESULT");
    expect(categories).toContain("ML_PREDICTION");
    expect(evidence.errors).toEqual([]);
  });

  it("required edge case: missing customer — records an error, never fabricates the customer", async () => {
    const store = new InMemoryOrchestrationStore();
    store.seedTransaction(makeTransaction());
    const alert = makeAlert();

    const evidence = await collectEvidence(store, alert, {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchReturning(ML_SUCCESS_BODY),
    });

    expect(evidence.errors.some((e) => e.category === "CUSTOMER_PROFILE")).toBe(true);
    expect(evidence.items.some((i) => i.category === "CUSTOMER_PROFILE")).toBe(false);
  });

  it("required edge case: ML service failure — degrades gracefully, records error, does not throw", async () => {
    const store = new InMemoryOrchestrationStore();
    store.seedCustomer(makeCustomer());
    store.seedCustomerProfile(makeCustomerProfile());
    store.seedTransaction(makeTransaction());
    const alert = makeAlert();

    const failingFetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const evidence = await collectEvidence(store, alert, { mlServiceUrl: "http://ml.test", fetchImpl: failingFetch });

    expect(evidence.errors.some((e) => e.category === "ML_PREDICTION")).toBe(true);
    const mlItem = evidence.items.find((i) => i.category === "ML_PREDICTION");
    expect(mlItem).toBeDefined();
    expect((mlItem?.data as { degraded: boolean }).degraded).toBe(true);
    // Critically: no fabricated score.
    expect((mlItem?.data as { score: number }).score).toBe(0);
  });

  it("HTTP error status from the ML service is treated as degraded, not thrown", async () => {
    const store = new InMemoryOrchestrationStore();
    store.seedCustomer(makeCustomer());
    store.seedCustomerProfile(makeCustomerProfile());
    store.seedTransaction(makeTransaction());
    const alert = makeAlert();

    const evidence = await collectEvidence(store, alert, {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchReturning({}, false),
    });

    expect(evidence.errors.some((e) => e.category === "ML_PREDICTION")).toBe(true);
  });
});
