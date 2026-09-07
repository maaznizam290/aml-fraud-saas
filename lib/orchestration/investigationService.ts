/**
 * Orchestrates one alert through the full investigation pipeline:
 *
 *   Alert -> Evidence Collection -> Risk Signals -> ML Score
 *         -> Claude Investigation -> Structured Recommendation
 *         -> (persist + audit + notify) -> Human Review
 *
 * This is the n8n workflow's logic, expressed as a directly callable,
 * directly testable TypeScript function — the n8n workflow (n8n/workflows)
 * calls this same logic via the webhook API route rather than
 * re-implementing it in n8n nodes. The workflow stops here: nothing past
 * HUMAN_REVIEW happens without a call into humanReview.ts, which requires
 * an analyst.
 */
import { randomUUID } from "node:crypto";

import type { Alert, RiskSignal } from "../supabase/types.js";
import { recordAudit } from "./audit.js";
import { collectEvidence } from "./evidence.js";
import type { LLMProvider } from "./llm/provider.js";
import { LLMProviderError } from "./llm/provider.js";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "./llm/prompt.js";
import { parseInvestigationOutput } from "./llm/outputSchema.js";
import type { NotificationDispatcher } from "./notifications/notifier.js";
import type { OrchestrationStore } from "./store.js";
import type { EvidenceBundle, InvestigationOutput, RiskSignalSummary } from "./types.js";

export interface InvestigationRunOptions {
  mlServiceUrl: string;
  mlTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface InvestigationRunResult {
  correlationId: string;
  alertId: string;
  caseId: string;
  caseCreated: boolean;
  recommendationId: string;
  output: InvestigationOutput;
  degraded: boolean;
  reused: boolean;
}

const FALLBACK_DISPOSITION = "REFER" as const;

export async function runInvestigation(
  store: OrchestrationStore,
  llm: LLMProvider,
  notifier: NotificationDispatcher,
  alert: Alert,
  options: InvestigationRunOptions
): Promise<InvestigationRunResult> {
  const correlationId = randomUUID();
  const auditCtx = { organizationId: alert.organization_id, actorId: null, actorRole: "SYSTEM", correlationId };

  // Idempotency: retried webhooks for an alert that's already been
  // investigated must not re-run (Claude/ML cost, duplicate cases) — see
  // docs/ORCHESTRATION.md "Idempotency".
  const existing = await store.findRecommendationByAlertId(alert.id);
  if (existing) {
    const existingCase = await store.getOrCreateCase({
      organizationId: alert.organization_id,
      alertId: alert.id,
      customerId: alert.customer_id,
      priority: severityToPriority(alert.severity),
    });
    return {
      correlationId,
      alertId: alert.id,
      caseId: existingCase.case.id,
      caseCreated: false,
      recommendationId: existing.id,
      output: recommendationToOutput(existing),
      degraded: false,
      reused: true,
    };
  }

  await recordAudit(store, auditCtx, "investigation_started", "alert", alert.id, { alertType: alert.alert_type });
  await store.updateAlertStatus(alert.id, "ANALYZING");

  const evidence = await collectEvidence(store, alert, {
    mlServiceUrl: options.mlServiceUrl,
    mlTimeoutMs: options.mlTimeoutMs,
    fetchImpl: options.fetchImpl,
  });
  await store.updateAlertStatus(alert.id, "EVIDENCE_COLLECTED");
  await recordAudit(store, auditCtx, "evidence_collected", "alert", alert.id, {
    itemCount: evidence.items.length,
    errorCount: evidence.errors.length,
  });
  for (const err of evidence.errors) {
    await recordAudit(store, auditCtx, "evidence_collection_failed", "alert", alert.id, {
      category: err.category,
      message: err.message,
    });
  }

  await persistDeterministicEvidence(store, alert, evidence, auditCtx, correlationId);

  await store.updateAlertStatus(alert.id, "AI_INVESTIGATING");
  const { output, degraded, provider, model } = await runClaudeInvestigation(
    store,
    llm,
    alert,
    evidence,
    auditCtx,
    correlationId
  );

  const recommendation = await store.insertRecommendation({
    organization_id: alert.organization_id,
    alert_id: alert.id,
    disposition: output.disposition,
    confidence: output.confidence,
    risk_level: output.riskLevel,
    rationale: output.rationale,
    red_flags: output.redFlags,
    supporting_evidence: output.supportingEvidence,
    contradictory_evidence: output.contradictoryEvidence,
    recommended_next_steps: output.recommendedNextSteps,
    ml_score_assessment: output.mlScoreAssessment,
    investigation_summary: output.investigationSummary,
    provider,
    model_name: model,
    prompt_version: PROMPT_VERSION,
    metadata: { correlationId, degraded, evidenceErrorCount: evidence.errors.length },
  });
  await recordAudit(store, auditCtx, "ai_recommendation_generated", "ai_recommendation", recommendation.id, {
    disposition: output.disposition,
    degraded,
  });

  await store.updateAlertStatus(alert.id, "RECOMMENDATION_READY");

  const { case: theCase, created: caseCreated } = await store.getOrCreateCase({
    organizationId: alert.organization_id,
    alertId: alert.id,
    customerId: alert.customer_id,
    priority: severityToPriority(alert.severity),
  });
  if (caseCreated) {
    await store.insertCaseEvent({
      organization_id: alert.organization_id,
      case_id: theCase.id,
      event_type: "case_created",
      actor_id: null,
      actor_role: "SYSTEM",
      description: `Case opened from ${alert.alert_type} alert (recommendation: ${output.disposition}).`,
      metadata: { correlationId },
    });
    await recordAudit(store, auditCtx, "case_created", "case", theCase.id, { alertId: alert.id });
  }

  // Stop here — this is the mandatory checkpoint before any consequential
  // action. Nothing past this point happens without a human calling
  // humanReview.ts.
  await store.updateAlertStatus(alert.id, "HUMAN_REVIEW");

  await notifier.notifyRecommendationReady(store, auditCtx, {
    alert,
    caseId: theCase.id,
    disposition: output.disposition,
    riskLevel: output.riskLevel,
    summary: output.investigationSummary,
  });

  return {
    correlationId,
    alertId: alert.id,
    caseId: theCase.id,
    caseCreated,
    recommendationId: recommendation.id,
    output,
    degraded,
    reused: false,
  };
}

async function runClaudeInvestigation(
  store: OrchestrationStore,
  llm: LLMProvider,
  alert: Alert,
  evidence: EvidenceBundle,
  auditCtx: Parameters<typeof recordAudit>[1],
  correlationId: string
): Promise<{ output: InvestigationOutput; degraded: boolean; provider: string; model: string }> {
  const systemPrompt = SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(alert, evidence);

  await recordAudit(store, auditCtx, "claude_request_sent", "alert", alert.id, {
    provider: llm.providerName,
    promptChars: userPrompt.length,
  });

  let response;
  try {
    response = await llm.investigate({ systemPrompt, userPrompt, correlationId });
  } catch (err) {
    const message = err instanceof LLMProviderError ? err.message : err instanceof Error ? err.message : String(err);
    await recordAudit(store, auditCtx, "claude_request_failed", "alert", alert.id, { error: message });
    return {
      output: fallbackOutput(`AI investigation provider failed: ${message}. Routed to human review with deterministic evidence only.`),
      degraded: true,
      provider: llm.providerName,
      model: "unavailable",
    };
  }

  await recordAudit(store, auditCtx, "claude_response_received", "alert", alert.id, {
    provider: response.provider,
    model: response.model,
    responseChars: response.rawText.length,
  });

  const parsed = parseInvestigationOutput(response.rawText);
  if (!parsed.ok) {
    await recordAudit(store, auditCtx, "claude_parse_failed", "alert", alert.id, {
      error: parsed.error,
      // Truncated — never log an unbounded blob into the audit trail.
      rawResponsePreview: parsed.rawResponse.slice(0, 500),
    });
    return {
      output: fallbackOutput(
        `AI response failed structured-output validation (${parsed.error}). Routed to human review — no AI recommendation was fabricated.`
      ),
      degraded: true,
      provider: response.provider,
      model: response.model,
    };
  }

  return { output: parsed.output, degraded: false, provider: response.provider, model: response.model };
}

function fallbackOutput(reason: string): InvestigationOutput {
  return {
    disposition: FALLBACK_DISPOSITION,
    confidence: 0,
    riskLevel: "MEDIUM",
    rationale: reason,
    redFlags: [],
    supportingEvidence: [],
    contradictoryEvidence: [],
    recommendedNextSteps: ["Manual investigation required — automated investigation could not complete."],
    mlScoreAssessment: "Not assessed — automated investigation did not complete.",
    investigationSummary: reason,
  };
}

async function persistDeterministicEvidence(
  store: OrchestrationStore,
  alert: Alert,
  evidence: EvidenceBundle,
  auditCtx: Parameters<typeof recordAudit>[1],
  correlationId: string
): Promise<void> {
  const riskSignalsItem = evidence.items.find((i) => i.category === "RISK_SIGNALS");
  if (riskSignalsItem) {
    const signals = riskSignalsItem.data as RiskSignalSummary[];
    const rows: Array<Omit<RiskSignal, "id" | "created_at" | "detected_at">> = signals.map((s) => ({
      organization_id: alert.organization_id,
      customer_id: alert.customer_id,
      transaction_id: alert.transaction_id,
      alert_id: alert.id,
      signal_type: s.signalType,
      weight: s.weight,
      value: { triggered: s.triggered },
      description: s.explanation,
    }));
    await store.insertRiskSignals(rows);
  }

  const mlItem = evidence.items.find((i) => i.category === "ML_PREDICTION");
  if (mlItem) {
    const ml = mlItem.data as EvidenceBundle["items"][number]["data"] & {
      provider: string;
      modelName: string;
      modelVersion: string;
      prediction: string;
      score: number;
      confidence: number | null;
      degraded: boolean;
    };
    if (!ml.degraded) {
      await store.insertMlPrediction({
        organization_id: alert.organization_id,
        customer_id: alert.customer_id,
        transaction_id: alert.transaction_id,
        alert_id: alert.id,
        model_version_id: null,
        provider: ml.provider,
        model_name: ml.modelName,
        prediction: ml.prediction,
        score: ml.score,
        confidence: ml.confidence,
        features: {},
        metadata: { correlationId },
      });
      await recordAudit(store, auditCtx, "ml_prediction_generated", "alert", alert.id, {
        provider: ml.provider,
        score: ml.score,
      });
    } else {
      await recordAudit(store, auditCtx, "ml_prediction_failed", "alert", alert.id, {});
    }
  }
}

function severityToPriority(severity: Alert["severity"]): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  switch (severity) {
    case "CRITICAL":
      return "URGENT";
    case "HIGH":
      return "HIGH";
    case "MEDIUM":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function recommendationToOutput(rec: {
  disposition: InvestigationOutput["disposition"];
  confidence: number | null;
  risk_level: InvestigationOutput["riskLevel"];
  rationale: string;
  red_flags: unknown;
  supporting_evidence: unknown;
  contradictory_evidence: unknown;
  recommended_next_steps: unknown;
  ml_score_assessment: string | null;
  investigation_summary: string | null;
}): InvestigationOutput {
  return {
    disposition: rec.disposition,
    confidence: rec.confidence ?? 0,
    riskLevel: rec.risk_level,
    rationale: rec.rationale,
    redFlags: (rec.red_flags as string[] | null) ?? [],
    supportingEvidence: (rec.supporting_evidence as string[] | null) ?? [],
    contradictoryEvidence: (rec.contradictory_evidence as string[] | null) ?? [],
    recommendedNextSteps: (rec.recommended_next_steps as string[] | null) ?? [],
    mlScoreAssessment: rec.ml_score_assessment ?? "",
    investigationSummary: rec.investigation_summary ?? "",
  };
}
