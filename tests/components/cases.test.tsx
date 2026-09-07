import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import CasesPage from "../../app/(dashboard)/cases/page.js";
import { SessionContext } from "../../lib/auth/session.js";
import { makeSessionState, mockFetchJson, TEST_ORG_ID } from "./testUtils.js";

describe("Cases page", () => {
  it("required scenario: renders open and resolved cases with status/priority/disposition", async () => {
    mockFetchJson([
      [
        "/api/cases?",
        {
          items: [
            {
              id: "case-1",
              organization_id: TEST_ORG_ID,
              case_number: "CASE-000001",
              alert_id: "alert-1",
              related_alert_ids: [],
              customer_id: "cust-1",
              assigned_analyst_id: "analyst-1",
              status: "RESOLVED",
              priority: "HIGH",
              disposition: "FALSE_POSITIVE",
              resolution_reason: "Verified legitimate.",
              opened_at: new Date().toISOString(),
              resolved_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          total: 1,
        },
      ],
    ]);

    render(
      <SessionContext.Provider value={makeSessionState()}>
        <CasesPage />
      </SessionContext.Provider>
    );

    await waitFor(() => expect(screen.getByText("CASE-000001")).toBeInTheDocument());
    expect(screen.getByRole("cell", { name: "HIGH" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "FALSE POSITIVE" })).toBeInTheDocument();
  });
});
