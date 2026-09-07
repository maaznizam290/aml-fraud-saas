/**
 * Executive Dashboard KPIs (task section 3). Reads recent alerts/cases from
 * the orchestration layer and feedback from Hermes, then tallies them —
 * see lib/dashboard/aggregate.ts for the actual computation (kept out of
 * this route so it stays testable without an HTTP layer).
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";
import { buildHermesRuntime } from "@/lib/hermes/runtime.js";
import { computeDashboardSummary } from "@/lib/dashboard/aggregate.js";

const querySchema = z.object({ organizationId: z.string().min(1) });
const SAMPLE_LIMIT = 500;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }
  const { organizationId } = parsed.data;

  const orchestrationRuntime = buildRuntime();
  const hermesRuntime = buildHermesRuntime();

  const [alertsResult, casesResult, feedbackResult] = await Promise.all([
    orchestrationRuntime.store.listAlerts(organizationId, { limit: SAMPLE_LIMIT }),
    orchestrationRuntime.store.listCases(organizationId, { limit: SAMPLE_LIMIT }),
    hermesRuntime.provider.listFeedback(organizationId, { limit: SAMPLE_LIMIT }),
  ]);

  const summary = computeDashboardSummary(
    alertsResult.items,
    casesResult.items,
    feedbackResult.ok ? feedbackResult.data : []
  );

  return NextResponse.json({
    summary,
    hermesDegraded: !feedbackResult.ok,
    sampleSize: { alerts: alertsResult.total, cases: casesResult.total },
  });
}
