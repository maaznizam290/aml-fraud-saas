/**
 * Skill listing + proposal (task sections 7 and 12). Proposing a skill only
 * ever creates a DRAFT/PROPOSED row — see lib/hermes/skills.ts and
 * lib/hermes/governance.ts for why nothing here can make a skill ACTIVE by
 * itself.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../lib/hermes/runtime.js";

const SKILL_STATUSES = ["DRAFT", "ACTIVE", "DEPRECATED"] as const;
const GOVERNANCE_STATUSES = ["PROPOSED", "REVIEW", "APPROVED", "VERSIONED", "DEPLOYED"] as const;

const querySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(SKILL_STATUSES).optional(),
  governanceState: z.enum(GOVERNANCE_STATUSES).optional(),
});

const proposeSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
  const result = await runtime.provider.listSkills(organizationId, filter);

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
    return NextResponse.json({ error: "Invalid skill proposal", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...input } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.proposeSkill(organizationId, input);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
