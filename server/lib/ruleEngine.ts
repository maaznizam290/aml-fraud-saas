import type { RuleCondition } from "../types.js";

/**
 * A flat row of the fields Hermes rules can reason about — the same shape
 * for a live transaction being scored and for a historical backtest row.
 */
export interface RuleEvaluationRow {
  amount_pkr: number;
  velocity_last_24h: number;
  account_age_days: number;
  device_risk_score: number;
}

export function evaluateRuleConditions(
  condition: RuleCondition,
  row: RuleEvaluationRow,
): boolean {
  if ("all" in condition) {
    return condition.all.every((child) => evaluateRuleConditions(child, row));
  }
  if ("any" in condition) {
    return condition.any.some((child) => evaluateRuleConditions(child, row));
  }

  const actual = row[condition.field as keyof RuleEvaluationRow];
  if (typeof actual !== "number") {
    return false;
  }

  switch (condition.op) {
    case "gt":
      return actual > condition.value;
    case "gte":
      return actual >= condition.value;
    case "lt":
      return actual < condition.value;
    case "lte":
      return actual <= condition.value;
    case "eq":
      return actual === condition.value;
    default:
      return false;
  }
}

export interface HistoricalCase extends RuleEvaluationRow {
  id: string;
  /** Ground truth from the confirmed analyst decision: true = actually fraud. */
  actual_fraud: boolean;
}

export interface ConfusionMatrix {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  total: number;
  accuracy: number;
}

/**
 * Runs a proposed rule against a set of historical, already-decided cases
 * and reports how it would have performed — the "simulated rule-testing
 * engine" the Hermes governance layer uses before a rule is ever eligible
 * for promotion to DEPLOYED.
 */
export function backtestRule(condition: RuleCondition, cases: HistoricalCase[]): ConfusionMatrix {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  for (const testCase of cases) {
    const flagged = evaluateRuleConditions(condition, testCase);
    if (flagged && testCase.actual_fraud) truePositives += 1;
    else if (flagged && !testCase.actual_fraud) falsePositives += 1;
    else if (!flagged && !testCase.actual_fraud) trueNegatives += 1;
    else falseNegatives += 1;
  }

  const total = cases.length;
  const accuracy = total === 0 ? 0 : (truePositives + trueNegatives) / total;

  return { truePositives, falsePositives, trueNegatives, falseNegatives, total, accuracy };
}
