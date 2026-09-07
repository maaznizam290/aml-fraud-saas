/**
 * Governance transition endpoint (task section 6): the only HTTP path that
 * can move a learning_candidates row forward. `transitionCandidate`
 * (lib/hermes/governance.ts) enforces the PROPOSED -> REVIEW -> APPROVED ->
 * VERSIONED -> DEPLOYED order, the ADMIN/COMPLIANCE_MANAGER role
 * requirement, and separation of duties (a proposer cannot approve or
 * deploy their own candidate) — this route does not duplicate any of that,
 * it only maps the result to an HTTP status.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../../../lib/hermes/runtime.js";

const requestSchema = z.object({
  organizationId: z.string().min(1),
  action: z.enum(["REVIEW", "APPROVE", "VERSION", "DEPLOY", "REJECT"]),
  actorId: z.string().min(1),
  actorRole: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { candidateId: string } }
): Promise<NextResponse> {
  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transition payload", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...transition } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.transitionCandidate(organizationId, {
    ...transition,
    candidateId: params.candidateId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
}
