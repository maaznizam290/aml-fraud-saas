/**
 * Settings page provider status (task section 13: never expose secrets).
 * Every field here is a boolean or a non-secret value (a public ML service
 * URL, numeric thresholds) — never a key, token, or webhook secret itself.
 */
import { NextResponse } from "next/server";

import { loadConfig } from "@/lib/orchestration/config.js";

export function GET(): NextResponse {
  try {
    const config = loadConfig();
    return NextResponse.json({
      mode: config.mode,
      claudeConfigured: Boolean(config.anthropicApiKey),
      claudeModel: config.claudeModel,
      slackConfigured: Boolean(config.slackWebhookUrl),
      resendConfigured: Boolean(config.resendApiKey),
      mlServiceUrl: config.mlServiceUrl,
      escalateThreshold: config.escalateThreshold,
      reviewThreshold: config.reviewThreshold,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Server configuration error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
