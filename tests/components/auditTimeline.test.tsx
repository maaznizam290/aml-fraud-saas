import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { AuditTimeline } from "../../components/domain/AuditTimeline.js";
import { mockFetchJson, TEST_ORG_ID } from "./testUtils.js";

describe("AuditTimeline", () => {
  it("required scenario: renders a chronological list of audit events", async () => {
    mockFetchJson([
      [
        "/api/audit",
        {
          items: [
            {
              id: "log-1",
              organization_id: TEST_ORG_ID,
              actor_id: null,
              actor_role: "SYSTEM",
              action: "investigation_started",
              entity_type: "alert",
              entity_id: "alert-1",
              correlation_id: "alert-1",
              metadata: {},
              created_at: new Date().toISOString(),
            },
            {
              id: "log-2",
              organization_id: TEST_ORG_ID,
              actor_id: "analyst-1",
              actor_role: "ANALYST",
              action: "analyst_decision_recorded",
              entity_type: "alert",
              entity_id: "alert-1",
              correlation_id: "alert-1",
              metadata: {},
              created_at: new Date().toISOString(),
            },
          ],
          hermesAvailable: true,
          hermesDegraded: false,
        },
      ],
    ]);

    render(<AuditTimeline organizationId={TEST_ORG_ID} alertId="alert-1" />);

    await waitFor(() => expect(screen.getByText("Investigation Started")).toBeInTheDocument());
    expect(screen.getByText("Analyst Decision Recorded")).toBeInTheDocument();
  });

  it("shows an empty state when there are no events", async () => {
    mockFetchJson([["/api/audit", { items: [], hermesAvailable: true, hermesDegraded: false }]]);
    render(<AuditTimeline organizationId={TEST_ORG_ID} />);
    await waitFor(() => expect(screen.getByText(/no audit events yet/i)).toBeInTheDocument());
  });
});
