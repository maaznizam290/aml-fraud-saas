import { describe, expect, it } from "vitest";
import { riskLevelForScore, statusForScore } from "./fraud.js";

describe("statusForScore", () => {
  it("auto-blocks at or above 0.85", () => {
    expect(statusForScore(0.85)).toBe("BLOCKED");
    expect(statusForScore(0.99)).toBe("BLOCKED");
  });

  it("auto-approves at or below 0.35", () => {
    expect(statusForScore(0.35)).toBe("APPROVED");
    expect(statusForScore(0.0)).toBe("APPROVED");
  });

  it("flags the grey zone as PENDING_REVIEW", () => {
    expect(statusForScore(0.5)).toBe("PENDING_REVIEW");
    expect(statusForScore(0.36)).toBe("PENDING_REVIEW");
    expect(statusForScore(0.84)).toBe("PENDING_REVIEW");
  });
});

describe("riskLevelForScore", () => {
  it("rates HIGH at or above 0.6", () => {
    expect(riskLevelForScore(0.6)).toBe("HIGH");
    expect(riskLevelForScore(0.8)).toBe("HIGH");
  });

  it("rates MEDIUM below 0.6", () => {
    expect(riskLevelForScore(0.4)).toBe("MEDIUM");
  });
});
