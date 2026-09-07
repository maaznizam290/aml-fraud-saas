import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HumanReviewPanel } from "../../components/domain/HumanReviewPanel.js";
import { SessionContext } from "../../lib/auth/session.js";
import { makeSessionState, mockFetchJson, TEST_ORG_ID } from "./testUtils.js";

describe("HumanReviewPanel", () => {
  it("required scenario: an ANALYST can submit an approval and sees the recorded outcome", async () => {
    mockFetchJson([
      ["/review", { alertId: "alert-1", caseId: "case-1", decision: "ESCALATE", agreedWithAi: true, overrideReason: null }],
      ["/api/hermes/feedback", { data: [] }],
    ]);

    render(
      <SessionContext.Provider value={makeSessionState({ identity: { userId: "analyst-1", organizationId: TEST_ORG_ID, role: "ANALYST", displayName: "A", email: null } })}>
        <HumanReviewPanel alertId="alert-1" organizationId={TEST_ORG_ID} recommendation={null} />
      </SessionContext.Provider>
    );

    await userEvent.type(screen.getByLabelText(/analyst notes/i), "Looks legitimate.");
    await userEvent.click(screen.getByRole("button", { name: /record decision/i }));

    await waitFor(() => expect(screen.getByText(/review recorded/i)).toBeInTheDocument());
    expect(screen.getByText(/ESCALATE/)).toBeInTheDocument();
  });

  it("required scenario: unauthorized access — a VIEWER cannot see the review form", () => {
    render(
      <SessionContext.Provider value={makeSessionState({ identity: { userId: "viewer-1", organizationId: TEST_ORG_ID, role: "VIEWER", displayName: "V", email: null } })}>
        <HumanReviewPanel alertId="alert-1" organizationId={TEST_ORG_ID} recommendation={null} />
      </SessionContext.Provider>
    );

    expect(screen.queryByRole("button", { name: /record decision/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot record a review decision/i)).toBeInTheDocument();
  });

  it("disables submit until a rationale is entered", () => {
    render(
      <SessionContext.Provider value={makeSessionState()}>
        <HumanReviewPanel alertId="alert-1" organizationId={TEST_ORG_ID} recommendation={null} />
      </SessionContext.Provider>
    );
    expect(screen.getByRole("button", { name: /record decision/i })).toBeDisabled();
  });
});
