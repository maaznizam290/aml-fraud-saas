import { describe, expect, it } from "vitest";

import {
  getAlertTool,
  getCustomerTool,
  getInstitutionalKnowledgeTool,
} from "../../lib/hermes/tools/investigationTools.js";
import { invokeTool, type ToolDeps } from "../../lib/hermes/tools/types.js";
import { InMemoryHermesStore } from "../../lib/hermes/stores/inMemoryHermesStore.js";
import { InMemoryOrchestrationStore } from "../../lib/orchestration/stores/inMemoryStore.js";
import { makeAlert, makeCustomer } from "../orchestration/fixtures.js";
import { ORG_A, ORG_B } from "./fixtures.js";

function makeDeps(): ToolDeps {
  const orchestrationStore = new InMemoryOrchestrationStore();
  orchestrationStore.seedCustomer(makeCustomer({ id: "cust-a-1", organization_id: ORG_A }));
  orchestrationStore.seedAlert(makeAlert({ id: "alert-a-1", customer_id: "cust-a-1", organization_id: ORG_A }));
  return { orchestrationStore, hermesStore: new InMemoryHermesStore() };
}

describe("invokeTool", () => {
  it("required scenario: org boundary — a caller from org B cannot retrieve org A's customer by id", async () => {
    const deps = makeDeps();
    const result = await invokeTool(
      getCustomerTool,
      deps,
      { organizationId: ORG_B, actorId: "analyst-b", actorRole: "ANALYST" },
      { customerId: "cust-a-1" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Reported the same way as "does not exist" — never confirms the id
      // belongs to another organization.
      expect(result.error).toBe("Customer not found");
    }
  });

  it("the rightful org can retrieve its own customer", async () => {
    const deps = makeDeps();
    const result = await invokeTool(
      getCustomerTool,
      deps,
      { organizationId: ORG_A, actorId: "analyst-a", actorRole: "ANALYST" },
      { customerId: "cust-a-1" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("cust-a-1");
  });

  it("required scenario: unauthorized access — an unrecognized role cannot invoke any tool", async () => {
    const deps = makeDeps();
    const result = await invokeTool(
      getAlertTool,
      deps,
      { organizationId: ORG_A, actorId: "someone", actorRole: "CUSTOMER" },
      { alertId: "alert-a-1" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not recognized");
  });

  it("required scenario: auditability — every tool call writes exactly one audit log row, success or failure", async () => {
    const deps = makeDeps();

    await invokeTool(
      getAlertTool,
      deps,
      { organizationId: ORG_A, actorId: "analyst-a", actorRole: "ANALYST" },
      { alertId: "alert-a-1" }
    );
    await invokeTool(
      getAlertTool,
      deps,
      { organizationId: ORG_A, actorId: "analyst-a", actorRole: "ANALYST" },
      { alertId: "does-not-exist" }
    );

    const logs = (deps.hermesStore as InMemoryHermesStore).getAuditLogs();
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.action === "hermes_tool_invoked")).toBe(true);
    expect(logs[0]?.organization_id).toBe(ORG_A);
  });

  it("get_institutional_knowledge is scoped to the caller's organization", async () => {
    const deps = makeDeps();
    await deps.hermesStore.insertMemory({
      organization_id: ORG_A,
      category: "INSTITUTIONAL",
      subject_type: null,
      subject_id: null,
      content: { note: "org A policy" },
      confidence: null,
      source: null,
    });
    await deps.hermesStore.insertMemory({
      organization_id: ORG_B,
      category: "INSTITUTIONAL",
      subject_type: null,
      subject_id: null,
      content: { note: "org B policy" },
      confidence: null,
      source: null,
    });

    const result = await invokeTool(
      getInstitutionalKnowledgeTool,
      deps,
      { organizationId: ORG_A, actorId: "analyst-a", actorRole: "ANALYST" },
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect((result.data[0]?.content as { note: string }).note).toBe("org A policy");
    }
  });
});
