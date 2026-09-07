/**
 * Case resolution endpoint — the final step of the case workflow (task
 * section 9). Always driven by an explicit analyst call; nothing upstream
 * ever reaches this automatically.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { HumanReviewError, resolveCase } from "../../../../../lib/orchestration/humanReview.js";
import { buildRuntime } from "../../../../../lib/orchestration/runtime.js";

const resolveRequestSchema = z.object({
  analystId: z.string().min(1),
  disposition: z.enum(["CONFIRMED_FRAUD", "FALSE_POSITIVE", "ESCALATED_EXTERNALLY", "CLEARED", "INSUFFICIENT_EVIDENCE", "OTHER"]),
  resolutionReason: z.string().min(1, "resolutionReason is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { caseId: string } }
): Promise<NextResponse> {
  const runtime = buildRuntime();

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = resolveRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid resolution payload", details: parsed.error.issues }, { status: 400 });
  }

  try {
    await resolveCase(runtime.store, runtime.notifier, {
      caseId: params.caseId,
      analystId: parsed.data.analystId,
      disposition: parsed.data.disposition,
      resolutionReason: parsed.data.resolutionReason,
      priority: parsed.data.priority,
    });
    return NextResponse.json({ caseId: params.caseId, status: "RESOLVED" }, { status: 200 });
  } catch (err) {
    if (err instanceof HumanReviewError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to resolve case", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
