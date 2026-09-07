/**
 * Case detail — the case, its linked alert, its event timeline, and the
 * analyst decisions recorded against its alert. Read-only; case resolution
 * itself stays on the existing POST /api/cases/:caseId/resolve route.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";
import { scopeToOrg } from "@/lib/dashboard/util.js";

const querySchema = z.object({ organizationId: z.string().min(1) });

export async function GET(
  request: Request,
  { params }: { params: { caseId: string } }
): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }
  const { organizationId } = parsed.data;
  const runtime = buildRuntime();

  const theCase = scopeToOrg(await runtime.store.getCase(params.caseId), organizationId);
  if (!theCase) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const [alert, events, decisions] = await Promise.all([
    theCase.alert_id ? runtime.store.getAlert(theCase.alert_id) : Promise.resolve(null),
    runtime.store.getCaseEvents(theCase.id),
    theCase.alert_id ? runtime.store.getAnalystDecisionsForAlert(theCase.alert_id) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    case: theCase,
    alert: scopeToOrg(alert, organizationId),
    events,
    analystDecisions: decisions,
  });
}
