/**
 * Environment configuration for the orchestration layer, including the
 * DEMO/REAL mode switch (task section 11).
 *
 * Mode is explicit (`ORCHESTRATION_MODE=DEMO|REAL`), never inferred from
 * "credentials happen to be missing" — a REAL deployment that's missing a
 * required secret should fail loudly at startup, not silently behave like
 * DEMO. Default is DEMO precisely so a fresh checkout with no secrets
 * configured can never accidentally hit real Claude/Slack/Resend/webhook
 * credentials.
 */

export type OrchestrationMode = "DEMO" | "REAL";

function readMode(): OrchestrationMode {
  const raw = (process.env["ORCHESTRATION_MODE"] ?? "DEMO").toUpperCase();
  if (raw !== "DEMO" && raw !== "REAL") {
    throw new Error(`ORCHESTRATION_MODE must be "DEMO" or "REAL", got ${JSON.stringify(raw)}`);
  }
  return raw;
}

export interface OrchestrationConfig {
  mode: OrchestrationMode;
  webhookSecret: string | null;
  anthropicApiKey: string | null;
  claudeModel: string;
  mlServiceUrl: string;
  slackWebhookUrl: string | null;
  resendApiKey: string | null;
  resendFromAddress: string | null;
  escalateThreshold: number;
  reviewThreshold: number;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): OrchestrationConfig {
  const mode = readMode();

  const config: OrchestrationConfig = {
    mode,
    webhookSecret: process.env["AML_WEBHOOK_SECRET"] ?? null,
    anthropicApiKey: process.env["ANTHROPIC_API_KEY"] ?? null,
    claudeModel: process.env["CLAUDE_INVESTIGATION_MODEL"] ?? "claude-sonnet-4-5",
    mlServiceUrl: process.env["ML_SERVICE_URL"] ?? "http://127.0.0.1:8000",
    slackWebhookUrl: process.env["SLACK_WEBHOOK_URL"] ?? null,
    resendApiKey: process.env["RESEND_API_KEY"] ?? null,
    resendFromAddress: process.env["RESEND_FROM_ADDRESS"] ?? null,
    escalateThreshold: readNumber("AML_ESCALATE_THRESHOLD", 0.75),
    reviewThreshold: readNumber("AML_REVIEW_THRESHOLD", 0.4),
  };

  // Fail loudly, not silently, if REAL mode is missing what it needs — see
  // module docstring. DEMO mode has no such requirement: it never reads
  // these values (DemoLLMProvider, in-memory store, no-op notifiers).
  if (mode === "REAL") {
    const missing: string[] = [];
    if (!config.webhookSecret) missing.push("AML_WEBHOOK_SECRET");
    if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
    if (missing.length > 0) {
      throw new Error(`ORCHESTRATION_MODE=REAL requires the following env vars: ${missing.join(", ")}`);
    }
  }

  return config;
}
