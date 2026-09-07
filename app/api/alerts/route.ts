/**
 * Alert Center listing (task section 3). Read-only, paginated, filterable —
 * wraps `OrchestrationStore.listAlerts` (feature/investigation-dashboard's
 * one addition to that interface for this purpose). Like the rest of this
 * project's API layer there is no session-based auth wired in yet (see
 * docs/ORCHESTRATION.md "Known limitations"): `organizationId` is trusted
 * as supplied. Every row returned is still scoped to that organizationId.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";

const querySchema = z.object({
  organizationId: z.string().min(1),
  status: z
    .enum(["RECEIVED", "ANALYZING", "EVIDENCE_COLLECTED", "AI_INVESTIGATING", "RECOMMENDATION_READY", "HUMAN_REVIEW", "RESOLVED"])
    .optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  minRiskScore: z.coerce.number().min(0).max(1).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...filter } = parsed.data;
  const runtime = buildRuntime();

  try {
    const { items, total } = await runtime.store.listAlerts(organizationId, filter);
    return NextResponse.json({ items, total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list alerts", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
