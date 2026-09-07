/**
 * Hermes availability status — lets the dashboard show a degraded banner
 * instead of silently failing (task section 10: fail-safe, task section
 * 12: dashboard read API). Read-only, no organization scoping needed since
 * it reports process-wide configuration, not tenant data.
 */
import { NextResponse } from "next/server";

import { buildHermesRuntime } from "../../../../lib/hermes/runtime.js";

export function GET(): NextResponse {
  const runtime = buildHermesRuntime();
  return NextResponse.json({
    providerName: runtime.provider.providerName,
    available: runtime.provider.available,
    mode: runtime.config.mode,
    enabled: runtime.config.enabled,
  });
}
