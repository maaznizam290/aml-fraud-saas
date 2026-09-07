import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { RoleGate } from "../../components/RoleGate.js";
import { canGovern } from "../../lib/auth/roles.js";
import { renderAsRole } from "./testUtils.js";

describe("RoleGate", () => {
  it("required scenario: hides the action for a role that fails the test", () => {
    renderAsRole(
      <RoleGate test={canGovern}>
        <button>Approve candidate</button>
      </RoleGate>,
      "ANALYST"
    );
    expect(screen.queryByRole("button", { name: "Approve candidate" })).not.toBeInTheDocument();
  });

  it("required scenario: shows the action for a role that passes the test", () => {
    renderAsRole(
      <RoleGate test={canGovern}>
        <button>Approve candidate</button>
      </RoleGate>,
      "COMPLIANCE_MANAGER"
    );
    expect(screen.getByRole("button", { name: "Approve candidate" })).toBeInTheDocument();
  });

  it("disables (rather than hides) when disable=true", () => {
    renderAsRole(
      <RoleGate test={canGovern} disable>
        <button>Approve candidate</button>
      </RoleGate>,
      "VIEWER"
    );
    expect(screen.getByRole("button", { name: "Approve candidate" })).toBeDisabled();
  });

  it("renders the fallback when provided and the role fails", () => {
    renderAsRole(
      <RoleGate test={canGovern} fallback={<p>Not permitted</p>}>
        <button>Approve candidate</button>
      </RoleGate>,
      "VIEWER"
    );
    expect(screen.getByText("Not permitted")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
