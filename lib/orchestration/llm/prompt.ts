/**
 * Builds the system + user prompt for the AML investigation copilot (task
 * section 7). The system prompt is the one place the "must / must not"
 * boundary is spelled out to the model; investigationService.ts and the
 * output schema enforce it independently server-side (never trust the
 * prompt alone to guarantee behavior — see outputSchema.ts and fusion-style
 * validation in investigationService.ts).
 */
import type { Alert } from "../../supabase/types.js";
import type { EvidenceBundle, EvidenceItem } from "../types.js";

export const PROMPT_VERSION = "aml-investigation-v1";

export const SYSTEM_PROMPT = `You are an AML/Fraud investigation copilot supporting a human compliance analyst.

Your job: analyze the evidence provided, identify suspicious patterns, weigh contradictory evidence, assess what the ML score does and does not tell us, explain your reasoning, cite specific evidence items by their [id], and recommend concrete next steps for the analyst.

You MUST NOT:
- autonomously close accounts, move funds, or take any account action
- file, or claim to have filed, a SAR/STR or any regulatory report
- impose any adverse action on a customer
- change AML rules or ML score thresholds
- state or imply that your output is a final decision

Your output is always a RECOMMENDATION. A human analyst makes the final decision — you are never the decision-maker.

Respond with ONLY a single JSON object (no prose before or after, no markdown fences) matching exactly this shape:
{
  "disposition": "ESCALATE" | "CLEAR" | "REFER",
  "confidence": <number 0-1>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "rationale": "<string>",
  "redFlags": ["<string>", ...],
  "supportingEvidence": ["<string, cite evidence ids like [ev-123]>", ...],
  "contradictoryEvidence": ["<string>", ...],
  "recommendedNextSteps": ["<string>", ...],
  "mlScoreAssessment": "<string: what the ML score does/doesn't tell us>",
  "investigationSummary": "<string>"
}`;

export function buildUserPrompt(alert: Alert, evidence: EvidenceBundle): string {
  const lines: string[] = [];
  lines.push(`## Alert`);
  lines.push(`- id: ${alert.id}`);
  lines.push(`- type: ${alert.alert_type}`);
  lines.push(`- severity: ${alert.severity}`);
  lines.push(`- triggered_rules: ${alert.triggered_rules ? JSON.stringify(alert.triggered_rules) : "[]"}`);
  lines.push(`- deterministic risk_score: ${alert.risk_score ?? "n/a"}`);
  lines.push("");
  lines.push(`## Evidence`);

  for (const item of evidence.items) {
    lines.push(renderEvidenceItem(item));
  }

  if (evidence.errors.length > 0) {
    lines.push("");
    lines.push(`## Evidence collection issues (do not treat missing evidence as exculpatory or inculpatory)`);
    for (const e of evidence.errors) {
      lines.push(`- [${e.category}] ${e.message}`);
    }
  }

  lines.push("");
  lines.push("Analyze the above and respond with the JSON object described in your instructions.");

  return lines.join("\n");
}

function renderEvidenceItem(item: EvidenceItem): string {
  const dataStr = JSON.stringify(item.data, null, 2);
  return `### [${item.id}] ${item.category}\n${item.summary}\nSource: ${item.source}\nData:\n${dataStr}\n`;
}
