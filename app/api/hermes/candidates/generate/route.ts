/**
 * Manually triggers the deterministic, threshold-based candidate scan over
 * recent feedback (lib/hermes/learningCandidates.ts). Produces only
 * PROPOSED candidates for human review — see that module's docstring for
 * why a single feedback event can never trigger this (task section 8).
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../../lib/hermes/runtime.js";

const requestSchema = z.object({ organizationId: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const runtime = buildHermesRuntime();
  const result = await runtime.provider.generateCandidatesFromFeedback(parsed.data.organizationId);

  if (!result.ok) {
    return NextResponse.json({ data: [], degraded: true, error: result.error }, { status: 200 });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
}
