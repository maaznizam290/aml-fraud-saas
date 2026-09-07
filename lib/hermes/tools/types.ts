/**
 * Controlled tool-call boundary (task section 9: "MCP/tool interfaces for
 * controlled investigation capabilities").
 *
 * There is no MCP SDK in this project (see package.json) and no live MCP
 * server to integrate with, so this is deliberately NOT built against the
 * real Model Context Protocol wire format — that would be exactly the kind
 * of fabricated integration the task brief forbids ("Do not invent Hermes
 * APIs... create a clean adapter/interface rather than fabricating an
 * API," applied here to MCP as well). Instead this is a small, honest
 * internal abstraction that mirrors MCP's shape — a named tool with a
 * description and a typed `execute` — so that:
 *   1. every "thing an AI agent or Hermes flow is allowed to look up" is
 *      enumerated in one place (`TOOL_REGISTRY` in investigationTools.ts)
 *      rather than scattered ad hoc queries, and
 *   2. wiring this up to a real MCP server later means writing one
 *      transport adapter over `ToolDefinition`, not redesigning the
 *      boundary.
 *
 * Every tool call is:
 *   - organization-scoped: the fetched entity's own organization_id is
 *     checked against the caller's organizationId before it is returned,
 *     even though the underlying store methods take a bare id (see
 *     docs/HERMES.md "Tool boundary"). A mismatch is reported the same way
 *     as "not found" — never "forbidden" — so a tool response never
 *     confirms that an id from another org exists.
 *   - role-checked: only the four known platform roles may invoke a tool
 *     at all; every tool is read-only, so no additional per-tool role
 *     restriction is applied on top of that today.
 *   - audited: `invokeTool` writes exactly one audit_logs row per call,
 *     success or failure, via the Hermes store (never skipped, never
 *     batched away).
 */
import type { HermesStore } from "../store.js";
import type { OrchestrationStore } from "../../orchestration/store.js";

export interface ToolContext {
  organizationId: string;
  actorId: string;
  actorRole: string;
}

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function toolOk<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function toolError<T>(error: string): ToolResult<T> {
  return { ok: false, error };
}

export interface ToolDeps {
  orchestrationStore: OrchestrationStore;
  hermesStore: HermesStore;
}

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  execute(deps: ToolDeps, ctx: ToolContext, input: TInput): Promise<ToolResult<TOutput>>;
}

export const KNOWN_ROLES = new Set(["ADMIN", "COMPLIANCE_MANAGER", "ANALYST", "VIEWER"]);

/**
 * Runs a tool with the boundary guarantees described above: role check,
 * exception containment (a thrown error becomes a `ToolResult`, never
 * propagates — consistent with the rest of Hermes's fail-safe design), and
 * exactly one audit log row.
 */
export async function invokeTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  deps: ToolDeps,
  ctx: ToolContext,
  input: TInput
): Promise<ToolResult<TOutput>> {
  if (!KNOWN_ROLES.has(ctx.actorRole)) {
    await audit(deps, ctx, tool.name, false, "unknown role");
    return toolError(`Role ${ctx.actorRole} is not recognized`);
  }

  try {
    const result = await tool.execute(deps, ctx, input);
    await audit(deps, ctx, tool.name, result.ok, result.ok ? null : result.error);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(deps, ctx, tool.name, false, message);
    return toolError(`${tool.name} failed: ${message}`);
  }
}

async function audit(
  deps: ToolDeps,
  ctx: ToolContext,
  toolName: string,
  ok: boolean,
  error: string | null
): Promise<void> {
  await deps.hermesStore.insertAuditLog({
    organization_id: ctx.organizationId,
    actor_id: ctx.actorId,
    actor_role: ctx.actorRole,
    action: "hermes_tool_invoked",
    entity_type: "hermes_tool",
    entity_id: null,
    correlation_id: null,
    metadata: { toolName, ok, error },
  });
}

/**
 * Shared org-boundary guard: returns the entity only if its own
 * organization_id matches the caller's. Every retrieval tool that reads by
 * bare id (getAlert, getCustomer, ...) must pass its result through this
 * before returning it — see module docstring.
 */
export function scopeToOrg<T extends { organization_id: string }>(
  entity: T | null,
  organizationId: string
): T | null {
  if (!entity) return null;
  return entity.organization_id === organizationId ? entity : null;
}
