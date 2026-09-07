/**
 * Learning-event feedback: retrieval + analytics (task sections 4 and 12),
 * and ingestion (task section 4/5's feedback loop entry point — the same
 * shape `ingestDecisionFeedback` expects, so a caller such as the human
 * review endpoint can feed an analyst decision straight into Hermes).
 *
 * The analytics summary is computed here from the returned feedback rows'
 * `learning_metadata.eventTypes` rather than added as a new provider
 * method, so `HermesProvider` stays a plain data-retrieval interface (see
 * provider.ts) and this route stays the one place that turns that data
 * into dashboard-shaped counts.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../lib/hermes/runtime.js";
import type { AgentFeedback, LearningEventType } from "../../../../lib/hermes/types.js";

const FEEDBACK_TYPES = ["CONFIRM", "OVERRULE", "CORRECTION", "COMMENT", "RATING"] as const;
const DISPOSITIONS = ["ESCALATE", "CLEAR", "REFER"] as const;

const querySchema = z.object({
  organizationId: z.string().min(1),
  alertId: z.string().optional(),
  caseId: z.string().optional(),
  feedbackType: z.enum(FEEDBACK_TYPES).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const ingestSchema = z.object({
  organizationId: z.string().min(1),
  alertId: z.string().min(1),
  caseId: z.string().nullable(),
  analystDecisionId: z.string().min(1),
  analystId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT", "OVERRIDE"]),
  decision: z.enum(DISPOSITIONS),
  agreedWithAi: z.boolean().nullable(),
  aiRecommendationId: z.string().nullable(),
  aiDisposition: z.enum(DISPOSITIONS).nullable(),
  mlScore: z.number().nullable(),
  mlPrediction: z.string().nullable(),
  finalCaseDisposition: z.enum(["CONFIRMED_FRAUD", "FALSE_POSITIVE"]).nullable().optional(),
  rationale: z.string().min(1),
});

function eventTypesOf(feedback: AgentFeedback): LearningEventType[] {
  const meta = feedback.learning_metadata as Record<string, unknown> | null;
  const eventTypes = meta?.["eventTypes"];
  return Array.isArray(eventTypes) ? (eventTypes as LearningEventType[]) : [];
}

function summarize(feedback: AgentFeedback[]) {
  const byFeedbackType: Record<string, number> = {};
  const byEventType: Record<string, number> = {};
  for (const f of feedback) {
    byFeedbackType[f.feedback_type] = (byFeedbackType[f.feedback_type] ?? 0) + 1;
    for (const eventType of eventTypesOf(f)) {
      byEventType[eventType] = (byEventType[eventType] ?? 0) + 1;
    }
  }
  return { total: feedback.length, byFeedbackType, byEventType };
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...filter } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.listFeedback(organizationId, filter);

  if (!result.ok) {
    return NextResponse.json(
      { data: [], analytics: summarize([]), degraded: true, error: result.error },
      { status: 200 }
    );
  }
  return NextResponse.json({ data: result.data, analytics: summarize(result.data), degraded: false }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback payload", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.ingestFeedback(organizationId, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
