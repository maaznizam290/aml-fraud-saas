/**
 * Runs one Demo Simulator scenario through the real investigation pipeline
 * (task section 3/16): Transaction -> Alert -> Evidence -> Risk -> ML ->
 * Claude -> Recommendation -> Human Review checkpoint. Seeds synthetic
 * data into the DEMO in-memory store, then calls the exact same
 * `runInvestigation` the production webhook route calls — nothing about
 * the pipeline is reimplemented here.
 *
 * DEMO mode only: this seeds fabricated data directly into a store, which
 * would corrupt a real database in REAL mode, so REAL mode refuses this
 * route outright rather than ever touching Supabase with synthetic rows.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildScenario, isDemoScenarioId } from "@/lib/dashboard/demoScenarios.js";
import { runInvestigation } from "@/lib/orchestration/investigationService.js";
import { buildRuntime } from "@/lib/orchestration/runtime.js";
import { InMemoryOrchestrationStore } from "@/lib/orchestration/stores/inMemoryStore.js";

const requestSchema = z.object({ scenarioId: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  const runtime = buildRuntime();
  if (runtime.config.mode !== "DEMO") {
    return NextResponse.json(
      { error: "The demo simulator only runs in DEMO mode (ORCHESTRATION_MODE=DEMO)." },
      { status: 409 }
    );
  }
  if (!(runtime.store instanceof InMemoryOrchestrationStore)) {
    return NextResponse.json({ error: "DEMO mode store is not the expected in-memory implementation." }, { status: 500 });
  }

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(jsonBody);
  if (!parsed.success || !isDemoScenarioId(parsed.data.scenarioId)) {
    return NextResponse.json({ error: "Unknown or invalid scenarioId" }, { status: 400 });
  }

  const seed = buildScenario(parsed.data.scenarioId);
  runtime.store.seedCustomer(seed.customer);
  runtime.store.seedCustomerProfile(seed.profile);
  for (const transaction of seed.transactions) runtime.store.seedTransaction(transaction);
  runtime.store.seedAlert(seed.alert);

  try {
    const result = await runInvestigation(runtime.store, runtime.llm, runtime.notifier, seed.alert, {
      mlServiceUrl: runtime.config.mlServiceUrl,
    });

    return NextResponse.json(
      {
        organizationId: seed.alert.organization_id,
        customerId: seed.customer.id,
        alertId: result.alertId,
        caseId: result.caseId,
        recommendationId: result.recommendationId,
        disposition: result.output.disposition,
        riskLevel: result.output.riskLevel,
        degraded: result.degraded,
        status: "HUMAN_REVIEW",
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Demo investigation pipeline failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
