/**
 * Audit Trail (task section 3): a unified chronological view spanning
 * alert/evidence/ML/AI events (written by lib/orchestration) and learning
 * events/governance actions (written by lib/hermes) — both layers write to
 * the same shared `audit_logs` table, so this route only merges and sorts
 * reads, it does not maintain a second audit system. In DEMO mode the two
 * layers' in-memory stores are separate singletons (see docs/HERMES.md
 * "Known limitations"), so the merge still happens here, client-side of
 * neither store.
 *
 * Scoping to one investigation is trickier than it looks:
 * `investigationService.ts` correlates its own audit rows (evidence
 * collected, Claude request/response, recommendation generated, case
 * created) by a *per-run* UUID generated at the start of `runInvestigation`
 * — not the alert's id — while `resolveCase()` and Hermes's learning-event
 * capture both correlate directly by alertId. Both are legitimate,
 * pre-existing choices from feature/n8n-orchestration and
 * feature/hermes-learning; this route reads around the difference rather
 * than changing either layer's correlation scheme. Passing `alertId`
 * resolves the per-run id via the alert's own recommendation (whose
 * `metadata.correlationId` records it) and queries both ids; passing the
 * lower-level `correlationId` directly skips that lookup.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";
import { buildHermesRuntime } from "@/lib/hermes/runtime.js";
import type { AuditLog } from "@/lib/supabase/types.js";

const querySchema = z.object({
  organizationId: z.string().min(1),
  correlationId: z.string().optional(),
  alertId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

function dedupeSortedDesc(logs: AuditLog[]): AuditLog[] {
  const seen = new Set<string>();
  const deduped = logs.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  return deduped.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }
  const { organizationId, correlationId, alertId, limit } = parsed.data;

  const orchestrationRuntime = buildRuntime();
  const hermesRuntime = buildHermesRuntime();

  const correlationIds = new Set<string>();
  if (correlationId) correlationIds.add(correlationId);
  if (alertId) {
    correlationIds.add(alertId);
    const recommendation = await orchestrationRuntime.store.findRecommendationByAlertId(alertId);
    const runCorrelationId =
      recommendation?.metadata && typeof recommendation.metadata === "object" && "correlationId" in recommendation.metadata
        ? String((recommendation.metadata as Record<string, unknown>)["correlationId"])
        : null;
    if (runCorrelationId) correlationIds.add(runCorrelationId);
  }
  const idsToQuery = correlationIds.size > 0 ? [...correlationIds] : [undefined];

  const [orchestrationLogs, hermesResults] = await Promise.all([
    Promise.all(idsToQuery.map((id) => orchestrationRuntime.store.listAuditLogs(organizationId, { correlationId: id, limit }))),
    Promise.all(idsToQuery.map((id) => hermesRuntime.provider.listAuditLogs(organizationId, { correlationId: id, limit }))),
  ]);

  const hermesDegraded = hermesResults.some((r) => !r.ok);
  const hermesLogs = hermesResults.flatMap((r) => (r.ok ? r.data : []));
  const merged = dedupeSortedDesc([...orchestrationLogs.flat(), ...hermesLogs]);

  return NextResponse.json({
    items: merged.slice(0, limit ?? 100),
    hermesAvailable: hermesRuntime.provider.available,
    hermesDegraded,
  });
}
