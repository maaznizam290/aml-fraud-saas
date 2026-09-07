/**
 * Exposes only the non-secret half of OrchestrationConfig (task section 13:
 * never leak backend secrets into the browser) so the frontend can render
 * itself correctly for DEMO vs REAL mode — e.g. showing the Demo Simulator
 * and a demo-identity role switcher only in DEMO mode, requiring real
 * Supabase auth in REAL mode. Nothing here is a toggle the browser can
 * flip; it only reports what the server is already configured to do.
 */
import { NextResponse } from "next/server";

import { loadConfig } from "@/lib/orchestration/config.js";

export function GET(): NextResponse {
  try {
    const config = loadConfig();
    return NextResponse.json({ mode: config.mode });
  } catch (err) {
    // loadConfig() fails loudly for a misconfigured REAL deployment (see
    // its own docstring) — surfaced here as a normal error response so the
    // frontend can render an error state instead of an opaque 500.
    return NextResponse.json(
      { error: "Server configuration error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
