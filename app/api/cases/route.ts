/**
 * Cases page listing (task section 3). Read-only, paginated, filterable —
 * wraps `OrchestrationStore.listCases`.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";

const querySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "RESOLVED", "CLOSED", "REOPENED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
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
    const { items, total } = await runtime.store.listCases(organizationId, filter);
    return NextResponse.json({ items, total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list cases", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
