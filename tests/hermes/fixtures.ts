import type { AnalystDecisionContext } from "../../lib/hermes/types.js";

export const ORG_A = "org-hermes-test-a";
export const ORG_B = "org-hermes-test-b";

export function makeDecisionContext(overrides: Partial<AnalystDecisionContext> = {}): AnalystDecisionContext {
  return {
    organizationId: ORG_A,
    alertId: "alert-test-0001",
    caseId: null,
    analystDecisionId: "decision-test-0001",
    analystId: "analyst-1",
    action: "APPROVE",
    decision: "ESCALATE",
    agreedWithAi: true,
    aiRecommendationId: "rec-test-0001",
    aiDisposition: "ESCALATE",
    mlScore: 0.8,
    mlPrediction: "FRAUD",
    finalCaseDisposition: null,
    rationale: "Consistent with prior pattern.",
    ...overrides,
  };
}
