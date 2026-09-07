/**
 * Learning-candidate listing + manual proposal (task sections 2, 6 and 12).
 * Every candidate created here starts at PROPOSED — see
 * lib/hermes/governance.ts for the only path that can move it further, and
 * why nothing in this route can do so itself.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../lib/hermes/runtime.js";

const IMPROVEMENT_TYPES = [
  "SKILL_REFINEMENT",
  "EVIDENCE_PRIORITIZATION",
  "FALSE_POSITIVE_PATTERN",
  "PROMPT_IMPROVEMENT",
  "MODEL_RECOMMENDATION",
  "RULE_RECOMMENDATION",
] as const;
const GOVERNANCE_STATUSES = ["PROPOSED", "REVIEW", "APPROVED", "VERSIONED", "DEPLOYED"] as const;

const querySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(GOVERNANCE_STATUSES).optional(),
  improvementType: z.enum(IMPROVEMENT_TYPES).optional(),
});

const proposeSchema = z.object({
  organizationId: z.string().min(1),
  improvementType: z.enum(IMPROVEMENT_TYPES),
  title: z.string().min(1),
  description: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  supportingFeedbackIds: z.array(z.string()).optional(),
  relatedSkillId: z.string().nullable().optional(),
  relatedModelVersionId: z.string().nullable().optional(),
  relatedRuleVersionId: z.string().nullable().optional(),
  proposedBy: z.string().min(1),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...filter } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.listCandidates(organizationId, filter);

  if (!result.ok) {
    return NextResponse.json({ data: [], degraded: true, error: result.error }, { status: 200 });
  }
  return NextResponse.json({ data: result.data, degraded: false }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = proposeSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid candidate payload", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...input } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.proposeCandidate(organizationId, input);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
