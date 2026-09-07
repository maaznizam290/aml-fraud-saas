/**
 * The `aml-fraud-alert` webhook (task section 3). Validates the HMAC
 * signature and payload shape before anything else runs, then drives one
 * alert through the full investigation pipeline (investigationService.ts).
 * Idempotent: a retried webhook for an already-investigated alert returns
 * the existing recommendation rather than re-running Claude/ML or creating
 * a duplicate case.
 */
import { NextResponse } from "next/server";

import { recordAudit } from "../../../../lib/orchestration/audit.js";
import { runInvestigation } from "../../../../lib/orchestration/investigationService.js";
import { buildRuntime } from "../../../../lib/orchestration/runtime.js";
import { verifyWebhookSignature } from "../../../../lib/orchestration/webhookAuth.js";
import { alertWebhookSchema } from "../../../../lib/orchestration/webhookSchema.js";

export async function POST(request: Request): Promise<NextResponse> {
  const runtime = buildRuntime();
  const rawBody = await request.text();

  // In DEMO mode there is no real secret to check against (see config.ts —
  // webhookSecret is null there); REAL mode always requires a valid
  // signature. Never log the secret or the signature value itself.
  if (runtime.config.mode === "REAL") {
    const signature = request.headers.get("x-aml-signature");
    if (!runtime.config.webhookSecret || !verifyWebhookSignature(runtime.config.webhookSecret, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid or missing webhook signature" }, { status: 401 });
    }
  }

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = alertWebhookSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid alert payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const alert = await runtime.store.getAlert(payload.alertId);
  if (!alert) {
    return NextResponse.json({ error: `Alert ${payload.alertId} not found` }, { status: 404 });
  }

  await recordAudit(
    runtime.store,
    { organizationId: alert.organization_id, actorId: null, actorRole: "SYSTEM", correlationId: alert.id },
    "webhook_received",
    "alert",
    alert.id,
    { alertType: payload.alertType, source: payload.source }
  );

  try {
    const result = await runInvestigation(runtime.store, runtime.llm, runtime.notifier, alert, {
      mlServiceUrl: runtime.config.mlServiceUrl,
    });

    return NextResponse.json(
      {
        correlationId: result.correlationId,
        alertId: result.alertId,
        caseId: result.caseId,
        caseCreated: result.caseCreated,
        recommendationId: result.recommendationId,
        disposition: result.output.disposition,
        riskLevel: result.output.riskLevel,
        degraded: result.degraded,
        reused: result.reused,
        status: "HUMAN_REVIEW",
      },
      { status: result.reused ? 200 : 202 }
    );
  } catch (err) {
    // Safe failure: the alert stays visible for retry/manual investigation
    // rather than the request hanging or crashing the process.
    return NextResponse.json(
      { error: "Investigation pipeline failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
