import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import AlertCenterPage from "../../app/(dashboard)/alerts/page.js";
import { SessionContext } from "../../lib/auth/session.js";
import { makeSessionState, mockFetchJson, TEST_ORG_ID } from "./testUtils.js";

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-0001",
    organization_id: TEST_ORG_ID,
    customer_id: "cust-0001",
    transaction_id: "txn-0001",
    related_transaction_ids: [],
    alert_type: "VELOCITY_ANOMALY",
    severity: "HIGH",
    status: "HUMAN_REVIEW",
    source: "RULE_ENGINE",
    triggered_rules: ["RULE_X"],
    risk_score: 0.8,
    ml_score: 0.7,
    assigned_analyst_id: null,
    opened_at: new Date().toISOString(),
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    transactionAmount: 1200,
    ...overrides,
  };
}

describe("Alert Center page", () => {
  it("required scenario: renders the alert table with required columns", async () => {
    mockFetchJson([["/api/alerts?", { items: [makeAlert()], total: 1 }]]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <AlertCenterPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText("VELOCITY ANOMALY")).toBeInTheDocument());
    expect(screen.getByText("$1,200")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Risk level" })).toBeInTheDocument();
  });

  it("shows an empty state when no alerts match", async () => {
    mockFetchJson([["/api/alerts?", { items: [], total: 0 }]]);
    render(
      <SessionContext.Provider value={makeSessionState()}>
        <AlertCenterPage />
      </SessionContext.Provider>
    );
    await waitFor(() => expect(screen.getByText(/no alerts match/i)).toBeInTheDocument());
  });
});
