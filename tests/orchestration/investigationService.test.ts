import { describe, expect, it } from "vitest";

import { DemoLLMProvider } from "../../lib/orchestration/llm/demoProvider.js";
import { LLMProviderError, type LLMInvestigationRequest, type LLMInvestigationResponse, type LLMProvider } from "../../lib/orchestration/llm/provider.js";
import { runInvestigation } from "../../lib/orchestration/investigationService.js";
import { createNoopNotifier } from "../../lib/orchestration/notifications/notifier.js";
import { InMemoryOrchestrationStore } from "../../lib/orchestration/stores/inMemoryStore.js";
import { makeAlert, makeCustomer, makeCustomerProfile, makeTransaction } from "./fixtures.js";

const VALID_CLAUDE_OUTPUT = {
  disposition: "REFER",
  confidence: 0.7,
  riskLevel: "MEDIUM",
  rationale: "Some evidence warrants a closer look.",
  redFlags: ["Unusual amount"],
  supportingEvidence: ["[ev-1] TRANSACTION_HISTORY"],
  contradictoryEvidence: [],
  recommendedNextSteps: ["Contact customer"],
  mlScoreAssessment: "Score is moderate, not conclusive alone.",
  investigationSummary: "Test investigation summary.",
};

class SuccessLLMProvider implements LLMProvider {
  readonly providerName = "test-success";
  async investigate(_req: LLMInvestigationRequest): Promise<LLMInvestigationResponse> {
    return {
      rawText: JSON.stringify(VALID_CLAUDE_OUTPUT),
      provider: this.providerName,
      model: "test-model",
      promptVersion: "test-v1",
    };
  }
}

class ThrowingLLMProvider implements LLMProvider {
  readonly providerName = "test-throwing";
  async investigate(): Promise<LLMInvestigationResponse> {
    throw new LLMProviderError("simulated provider outage", this.providerName);
  }
}

class MalformedLLMProvider implements LLMProvider {
  readonly providerName = "test-malformed";
  async investigate(): Promise<LLMInvestigationResponse> {
    return {
      rawText: "Sure, here's my analysis: the customer looks fine, no JSON here.",
      provider: this.providerName,
      model: "test-model",
      promptVersion: "test-v1",
    };
  }
}

function fetchMlSuccess(): typeof fetch {
  const body = {
    status: "ok",
    risk_signals: [],
    ml_prediction: {
      provider: "local",
      model_name: "xgboost-fraud",
      model_version: "1.0.0",
      prediction: "FRAUD_UNLIKELY",
      score: 0.2,
      confidence: null,
    },
    risk_assessment: { disposition: "CLEAR", risk_level: "LOW", rationale: "clean", ml_contributed: true },
    errors: [],
  };
  return (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

function seedStore(): InMemoryOrchestrationStore {
  const store = new InMemoryOrchestrationStore();
  store.seedCustomer(makeCustomer());
  store.seedCustomerProfile(makeCustomerProfile());
  store.seedTransaction(makeTransaction());
  store.seedAlert(makeAlert());
  return store;
}

describe("runInvestigation", () => {
  it("required scenario: valid alert with a successful Claude response produces a stored recommendation and stops at HUMAN_REVIEW", async () => {
    const store = seedStore();
    const result = await runInvestigation(store, new SuccessLLMProvider(), createNoopNotifier(), makeAlert(), {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchMlSuccess(),
    });

    expect(result.degraded).toBe(false);
    expect(result.output.disposition).toBe("REFER");
    const alert = await store.getAlert("alert-test-0001");
    expect(alert?.status).toBe("HUMAN_REVIEW");
    expect(result.caseCreated).toBe(true);

    const auditLogs = store.getAuditLogs();
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain("investigation_started");
    expect(actions).toContain("evidence_collected");
    expect(actions).toContain("ai_recommendation_generated");
    expect(actions).toContain("case_created");
  });

  it("required scenario: Claude/provider failure routes to REFER/human review and records the failure in the audit log — never fabricates output", async () => {
    const store = seedStore();
    const result = await runInvestigation(store, new ThrowingLLMProvider(), createNoopNotifier(), makeAlert(), {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchMlSuccess(),
    });

    expect(result.degraded).toBe(true);
    expect(result.output.disposition).toBe("REFER");
    expect(result.output.confidence).toBe(0);

    const actions = store.getAuditLogs().map((l) => l.action);
    expect(actions).toContain("claude_request_failed");
    expect(actions).not.toContain("claude_parse_failed");
  });

  it("required scenario: malformed Claude response is never guessed at — routes to REFER and records claude_parse_failed", async () => {
    const store = seedStore();
    const result = await runInvestigation(store, new MalformedLLMProvider(), createNoopNotifier(), makeAlert(), {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchMlSuccess(),
    });

    expect(result.degraded).toBe(true);
    expect(result.output.disposition).toBe("REFER");

    const actions = store.getAuditLogs().map((l) => l.action);
    expect(actions).toContain("claude_parse_failed");
  });

  it("required scenario: duplicate webhook is idempotent — does not re-run Claude/ML or create a second case", async () => {
    const store = seedStore();
    const alert = makeAlert();

    const first = await runInvestigation(store, new SuccessLLMProvider(), createNoopNotifier(), alert, {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchMlSuccess(),
    });
    expect(first.reused).toBe(false);

    // Refetch the alert since runInvestigation mutates its status — a real
    // retried webhook would look the alert up again too.
    const refetchedAlert = await store.getAlert(alert.id);
    const second = await runInvestigation(store, new SuccessLLMProvider(), createNoopNotifier(), refetchedAlert!, {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchMlSuccess(),
    });

    expect(second.reused).toBe(true);
    expect(second.recommendationId).toBe(first.recommendationId);
    expect(second.caseId).toBe(first.caseId);
  });

  it("demo mode: DemoLLMProvider integrates end-to-end and produces a valid, parseable recommendation", async () => {
    const store = seedStore();
    const result = await runInvestigation(store, new DemoLLMProvider(), createNoopNotifier(), makeAlert(), {
      mlServiceUrl: "http://ml.test",
      fetchImpl: fetchMlSuccess(),
    });

    expect(result.degraded).toBe(false);
    expect(["ESCALATE", "CLEAR", "REFER"]).toContain(result.output.disposition);
    expect(result.output.investigationSummary).toContain("[DEMO MODE]");
  });

  it("ML service failure does not block the investigation — deterministic evidence still produces a recommendation", async () => {
    const store = seedStore();
    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await runInvestigation(store, new SuccessLLMProvider(), createNoopNotifier(), makeAlert(), {
      mlServiceUrl: "http://ml.test",
      fetchImpl: failingFetch,
    });

    // The overall investigation still completes (Claude succeeded); ML_PREDICTION failure is recorded separately.
    expect(result.output.disposition).toBe("REFER");
    const actions = store.getAuditLogs().map((l) => l.action);
    expect(actions).toContain("ml_prediction_failed");
  });
});
