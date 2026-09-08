import { describe, expect, it } from "vitest";
import { backtestRule, evaluateRuleConditions, type HistoricalCase } from "./ruleEngine.js";
import type { RuleCondition } from "../types.js";

const baseRow = {
  amount_pkr: 10000,
  velocity_last_24h: 1,
  account_age_days: 100,
  device_risk_score: 0.1,
};

describe("evaluateRuleConditions", () => {
  it("evaluates a single leaf condition", () => {
    const condition: RuleCondition = { field: "amount_pkr", op: "gt", value: 5000 };
    expect(evaluateRuleConditions(condition, baseRow)).toBe(true);
    expect(evaluateRuleConditions({ field: "amount_pkr", op: "lt", value: 5000 }, baseRow)).toBe(false);
  });

  it("combines conditions with 'all' (AND)", () => {
    const condition: RuleCondition = {
      all: [
        { field: "amount_pkr", op: "gt", value: 50000 },
        { field: "account_age_days", op: "lt", value: 3 },
      ],
    };
    expect(evaluateRuleConditions(condition, { ...baseRow, amount_pkr: 60000, account_age_days: 1 })).toBe(
      true,
    );
    expect(evaluateRuleConditions(condition, baseRow)).toBe(false);
  });

  it("combines conditions with 'any' (OR)", () => {
    const condition: RuleCondition = {
      any: [
        { field: "amount_pkr", op: "gt", value: 500000 },
        { field: "device_risk_score", op: "gte", value: 0.1 },
      ],
    };
    expect(evaluateRuleConditions(condition, baseRow)).toBe(true);
  });

  it("returns false for a field that is not numeric on the row", () => {
    const condition: RuleCondition = { field: "not_a_field", op: "gt", value: 1 };
    expect(evaluateRuleConditions(condition, baseRow)).toBe(false);
  });
});

describe("backtestRule", () => {
  const cases: HistoricalCase[] = [
    { id: "a", amount_pkr: 60000, velocity_last_24h: 1, account_age_days: 1, device_risk_score: 0.7, actual_fraud: true },
    { id: "b", amount_pkr: 5000, velocity_last_24h: 1, account_age_days: 400, device_risk_score: 0.05, actual_fraud: false },
    { id: "c", amount_pkr: 70000, velocity_last_24h: 1, account_age_days: 500, device_risk_score: 0.1, actual_fraud: false },
  ];

  it("produces a confusion matrix for a rule", () => {
    const condition: RuleCondition = {
      all: [
        { field: "amount_pkr", op: "gt", value: 50000 },
        { field: "account_age_days", op: "lt", value: 3 },
      ],
    };
    const matrix = backtestRule(condition, cases);
    expect(matrix.truePositives).toBe(1);
    expect(matrix.falsePositives).toBe(0);
    expect(matrix.trueNegatives).toBe(2);
    expect(matrix.falseNegatives).toBe(0);
    expect(matrix.accuracy).toBe(1);
  });

  it("counts false positives when a rule overtriggers", () => {
    const condition: RuleCondition = { field: "amount_pkr", op: "gt", value: 50000 };
    const matrix = backtestRule(condition, cases);
    expect(matrix.truePositives).toBe(1);
    expect(matrix.falsePositives).toBe(1);
  });
});
