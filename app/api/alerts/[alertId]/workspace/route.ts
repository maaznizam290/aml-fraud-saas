/**
 * Investigation Workspace consolidated read (task section 6 — the most
 * important screen). Single round trip instead of the workspace waterfalling
 * six separate fetches (task section 12: avoid duplicated/excessive
 * client-side fetching) — composes existing, already-tested store getters;
 * computes nothing new. `organizationId` is required and every nested
 * lookup is checked against it before being returned, the same
 * never-confirm-cross-org-existence pattern as lib/hermes/tools.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";
import { scopeToOrg } from "@/lib/dashboard/util.js";

const querySchema = z.object({ organizationId: z.string().min(1) });

export async function GET(
  request: Request,
  { params }: { params: { alertId: string } }
): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }
  const { organizationId } = parsed.data;
  const runtime = buildRuntime();
  const store = runtime.store;

  const alert = scopeToOrg(await store.getAlert(params.alertId), organizationId);
  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  const [customer, customerProfile, transaction, recentTransactions, riskSignals, mlPrediction, recommendation, theCase, analystDecisions] =
    await Promise.all([
      store.getCustomer(alert.customer_id),
      store.getCustomerProfile(alert.customer_id),
      alert.transaction_id ? store.getTransaction(alert.transaction_id) : Promise.resolve(null),
      store.getRecentTransactions(alert.customer_id, alert.created_at, 25),
      store.getRiskSignalsForAlert(alert.id),
      store.getLatestMlPredictionForAlert(alert.id),
      store.findRecommendationByAlertId(alert.id),
      store.getCaseByAlertId(alert.id),
      store.getAnalystDecisionsForAlert(alert.id),
    ]);

  return NextResponse.json({
    alert,
    customer: scopeToOrg(customer, organizationId),
    customerProfile: customerProfile && customerProfile.organization_id === organizationId ? customerProfile : null,
    transaction,
    recentTransactions,
    riskSignals,
    mlPrediction,
    recommendation: recommendation && recommendation.organization_id === organizationId ? recommendation : null,
    case: scopeToOrg(theCase, organizationId),
    analystDecisions,
  });
}
