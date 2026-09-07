import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DemoSimulatorPage from "../../app/(dashboard)/demo/page.js";
import { SessionContext } from "../../lib/auth/session.js";
import { makeSessionState, mockFetchJson, TEST_ORG_ID } from "./testUtils.js";

describe("Demo Simulator page", () => {
  it("required scenario: lists the five scenarios in DEMO mode", async () => {
    mockFetchJson([
      [
        "/api/demo/scenarios",
        {
          scenarios: [
            { id: "high_velocity", title: "High-velocity transfers", description: "d", expectedNarrative: "n" },
            { id: "structuring", title: "Structuring", description: "d", expectedNarrative: "n" },
            { id: "false_positive", title: "False positive", description: "d", expectedNarrative: "n" },
          ],
          demoModeActive: true,
        },
      ],
    ]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <DemoSimulatorPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText("High-velocity transfers")).toBeInTheDocument());
    expect(screen.getByText("Structuring")).toBeInTheDocument();
    expect(screen.getByText("False positive")).toBeInTheDocument();
  });

  it("required scenario: is disabled in REAL mode", async () => {
    mockFetchJson([["/api/demo/scenarios", { scenarios: [], demoModeActive: false }]]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <DemoSimulatorPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText(/only runs in DEMO mode/i)).toBeInTheDocument());
  });

  it("required scenario: running a scenario shows the pipeline and recommendation", async () => {
    mockFetchJson([
      [
        "/api/demo/scenarios",
        {
          scenarios: [{ id: "high_velocity", title: "High-velocity transfers", description: "d", expectedNarrative: "n" }],
          demoModeActive: true,
        },
      ],
      [
        "/api/demo/trigger",
        {
          organizationId: TEST_ORG_ID,
          customerId: "cust-1",
          alertId: "alert-1",
          caseId: "case-1",
          recommendationId: "rec-1",
          disposition: "ESCALATE",
          riskLevel: "HIGH",
          degraded: false,
          status: "HUMAN_REVIEW",
        },
      ],
      [
        "/workspace?",
        {
          alert: {
            id: "alert-1",
            organization_id: TEST_ORG_ID,
            severity: "HIGH",
            status: "HUMAN_REVIEW",
            alert_type: "VELOCITY_ANOMALY",
          },
          recommendation: null,
        },
      ],
      ["/api/audit", { items: [], hermesAvailable: true, hermesDegraded: false }],
    ]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <DemoSimulatorPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText("High-velocity transfers")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /run scenario/i }));

    await waitFor(() => expect(screen.getByText("Live run")).toBeInTheDocument());
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });
});
