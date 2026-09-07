/**
 * Static metadata for the five Demo Simulator scenarios (task section 3).
 * No side effects — POST /api/demo/trigger runs one.
 */
import { NextResponse } from "next/server";

import { DEMO_SCENARIOS } from "@/lib/dashboard/demoScenarios.js";
import { buildRuntime } from "@/lib/orchestration/runtime.js";

export function GET(): NextResponse {
  const runtime = buildRuntime();
  return NextResponse.json({ scenarios: DEMO_SCENARIOS, demoModeActive: runtime.config.mode === "DEMO" });
}
