/**
 * Memory retrieval + creation (task sections 3 and 12). Like the rest of
 * this project's minimal API layer (see docs/ORCHESTRATION.md "Known
 * limitations"), there is no session-based auth wired in yet — callers
 * supply `organizationId` directly and it is trusted as-is. Every read
 * this route performs is still scoped to that organizationId by
 * `HermesProvider`/`HermesStore`, so a caller can only ever see one
 * organization's memories per request; the gap is authenticating *which*
 * organization the caller represents, not tenant isolation of the data
 * itself.
 *
 * A Hermes-unavailable result is never surfaced as an HTTP error here —
 * the dashboard gets `{ degraded: true, data: [] }` and stays usable (task
 * section 10).
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../lib/hermes/runtime.js";

const MEMORY_CATEGORIES = ["EPISODIC", "SEMANTIC", "PROCEDURAL", "INVESTIGATION", "INSTITUTIONAL"] as const;

const querySchema = z.object({
  organizationId: z.string().min(1),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const createSchema = z.object({
  organizationId: z.string().min(1),
  category: z.enum(MEMORY_CATEGORIES),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...query } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.retrieveMemories(organizationId, query);

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

  const parsed = createSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid memory payload", details: parsed.error.issues }, { status: 400 });
  }

  const { organizationId, ...input } = parsed.data;
  const runtime = buildHermesRuntime();
  const result = await runtime.provider.createMemory(organizationId, input);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
