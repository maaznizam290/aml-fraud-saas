import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import InvestigationWorkspacePage from "../../app/(dashboard)/alerts/[alertId]/page.js";
import { SessionContext } from "../../lib/auth/session.js";
import { makeSessionState, mockFetchJson, TEST_ORG_ID } from "./testUtils.js";

describe("Investigation Workspace page", () => {
  it("required scenario: renders alert summary, customer profile, and status", async () => {
    mockFetchJson([
      [
        "/workspace?",
        {
          alert: {
            id: "alert-1",
            organization_id: TEST_ORG_ID,
            customer_id: "cust-1",
            transaction_id: "txn-1",
            related_transaction_ids: [],
            alert_type: "STRUCTURING",
            severity: "CRITICAL",
            status: "HUMAN_REVIEW",
            source: "RULE_ENGINE",
            triggered_rules: ["RULE_STRUCTURING"],
            risk_score: 0.9,
            ml_score: null,
            assigned_analyst_id: null,
            opened_at: new Date().toISOString(),
            resolved_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          customer: {
            id: "cust-1",
            organization_id: TEST_ORG_ID,
            external_customer_id: "CUST-1",
            full_name: "Jane Doe",
            email: null,
            phone: null,
            date_of_birth: null,
            country_code: "US",
            status: "ACTIVE",
            risk_rating: "HIGH",
            kyc_status: "VERIFIED",
            account_opened_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          customerProfile: null,
          transaction: null,
          recentTransactions: [],
          riskSignals: [],
          mlPrediction: null,
          recommendation: null,
          case: null,
          analystDecisions: [],
        },
      ],
    ]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <InvestigationWorkspacePage params={{ alertId: "alert-1" }} />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText(/STRUCTURING — Jane Doe/)).toBeInTheDocument());
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});
