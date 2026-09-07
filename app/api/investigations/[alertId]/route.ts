/**
 * Investigation status lookup — supports the live-demo status ladder (task
 * section 12: RECEIVED..RESOLVED) and general reconstruction of what
 * happened for a given alert.
 */
import { NextResponse } from "next/server";

import { buildRuntime } from "../../../../lib/orchestration/runtime.js";

export async function GET(
  _request: Request,
  { params }: { params: { alertId: string } }
): Promise<NextResponse> {
  const runtime = buildRuntime();
  const alert = await runtime.store.getAlert(params.alertId);
  if (!alert) {
    return NextResponse.json({ error: `Alert ${params.alertId} not found` }, { status: 404 });
  }

  const recommendation = await runtime.store.findRecommendationByAlertId(params.alertId);

  return NextResponse.json({
    alertId: alert.id,
    status: alert.status,
    severity: alert.severity,
    alertType: alert.alert_type,
    riskScore: alert.risk_score,
    mlScore: alert.ml_score,
    recommendation: recommendation
      ? {
          id: recommendation.id,
          disposition: recommendation.disposition,
          confidence: recommendation.confidence,
          riskLevel: recommendation.risk_level,
          investigationSummary: recommendation.investigation_summary,
          provider: recommendation.provider,
          modelName: recommendation.model_name,
        }
      : null,
  });
}
