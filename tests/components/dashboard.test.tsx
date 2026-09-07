import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import ExecutiveDashboardPage from "../../app/(dashboard)/dashboard/page.js";
import { SessionContext } from "../../lib/auth/session.js";
import { makeSessionState, mockFetchJson } from "./testUtils.js";

describe("Executive Dashboard page", () => {
  it("required scenario: renders KPI tiles from the summary API", async () => {
    mockFetchJson([
      [
        "/api/dashboard/summary",
        {
          summary: {
            activeAlerts: 4,
            highRiskAlerts: 2,
            openCases: 3,
            totalCases: 5,
            falsePositiveRate: 0.25,
            avgInvestigationTimeMinutes: 42,
            aiAgreementRate: 0.8,
            riskDistribution: [
              { severity: "LOW", count: 1 },
              { severity: "MEDIUM", count: 2 },
              { severity: "HIGH", count: 3 },
              { severity: "CRITICAL", count: 0 },
            ],
            alertTrend: [{ date: "2026-01-01", count: 2 }],
            caseOutcomes: [],
          },
          hermesDegraded: false,
          sampleSize: { alerts: 10, cases: 5 },
        },
      ],
    ]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <ExecutiveDashboardPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    expect(screen.getByText("Active alerts")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("shows an error state with retry when the summary request fails", async () => {
    mockFetchJson([["/api/dashboard/summary", { error: "boom" }, 500]]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <ExecutiveDashboardPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
