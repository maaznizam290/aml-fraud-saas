/**
 * Human review endpoint (task section 8): approve / reject / override an
 * AI recommendation. This is where a recommendation becomes a decision —
 * see lib/orchestration/humanReview.ts for the full audit/case-update logic.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { HumanReviewError, submitHumanReview } from "../../../../../lib/orchestration/humanReview.js";
import { buildRuntime } from "../../../../../lib/orchestration/runtime.js";

const reviewRequestSchema = z.object({
  analystId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT", "OVERRIDE"]),
  overrideDisposition: z.enum(["ESCALATE", "CLEAR", "REFER"]).optional(),
  rationale: z.string().min(1, "rationale is required"),
});

export async function POST(
  request: Request,
  { params }: { params: { alertId: string } }
): Promise<NextResponse> {
  const runtime = buildRuntime();

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = reviewRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review payload", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await submitHumanReview(runtime.store, {
      alertId: params.alertId,
      analystId: parsed.data.analystId,
      action: parsed.data.action,
      overrideDisposition: parsed.data.overrideDisposition,
      rationale: parsed.data.rationale,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof HumanReviewError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to record human review", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
