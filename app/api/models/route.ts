/**
 * Model Registry (task section 3): lists model_versions + rule_versions —
 * read-only reference data, never a deployment action. Deploying a model
 * or rule stays entirely outside this branch's (and this route's) scope —
 * see docs/HERMES.md "What is and is not autonomous".
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "@/lib/hermes/runtime.js";

const querySchema = z.object({ organizationId: z.string().min(1) });

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }
  const { organizationId } = parsed.data;
  const runtime = buildHermesRuntime();

  const [modelResult, ruleResult] = await Promise.all([
    runtime.provider.listModelVersions(organizationId),
    runtime.provider.listRuleVersions(organizationId),
  ]);

  return NextResponse.json({
    models: modelResult.ok ? modelResult.data : [],
    rules: ruleResult.ok ? ruleResult.data : [],
    degraded: !modelResult.ok || !ruleResult.ok,
  });
}
