/**
 * Deterministic, network-free LLMProvider for DEMO mode and tests. It reads
 * the *same rendered prompt text* a real model would (see prompt.ts) and
 * applies simple, transparent heuristics — it never calls out to Anthropic,
 * so an investor demo or a test run never depends on network access or a
 * real API key, and never accidentally uses production credentials for
 * demo data (task section 11).
 */
import { PROMPT_VERSION } from "./prompt.js";
import type { LLMInvestigationRequest, LLMInvestigationResponse, LLMProvider } from "./provider.js";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function extractEvidenceIds(prompt: string): string[] {
  return [...prompt.matchAll(/^### \[([\w-]+)\] (\w+)/gm)].map((m) => `[${m[1]}] ${m[2]}`);
}

function extractFirstScore(prompt: string): number | null {
  const match = prompt.match(/"score":\s*([0-9]*\.?[0-9]+)/);
  return match?.[1] ? Number(match[1]) : null;
}

export class DemoLLMProvider implements LLMProvider {
  readonly providerName = "demo";

  async investigate(request: LLMInvestigationRequest): Promise<LLMInvestigationResponse> {
    const prompt = request.userPrompt;

    const confirmedSanctionsMatch = prompt.includes('"sanctionsStatus": "CONFIRMED_MATCH"');
    const potentialSanctionsMatch = prompt.includes('"sanctionsStatus": "POTENTIAL_MATCH"');
    const triggeredCount = countOccurrences(prompt, '"triggered": true');
    const mlScore = extractFirstScore(prompt);
    const evidenceIds = extractEvidenceIds(prompt);

    let disposition: "ESCALATE" | "CLEAR" | "REFER";
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    let confidence: number;

    if (confirmedSanctionsMatch || triggeredCount >= 3 || (mlScore ?? 0) >= 0.75) {
      disposition = "ESCALATE";
      riskLevel = confirmedSanctionsMatch ? "CRITICAL" : "HIGH";
      confidence = 0.82;
    } else if (potentialSanctionsMatch || triggeredCount >= 1 || (mlScore ?? 0) >= 0.4) {
      disposition = "REFER";
      riskLevel = "MEDIUM";
      confidence = 0.65;
    } else {
      disposition = "CLEAR";
      riskLevel = "LOW";
      confidence = 0.7;
    }

    const rawText = JSON.stringify({
      disposition,
      confidence,
      riskLevel,
      rationale: `[DEMO] Deterministic assessment from ${triggeredCount} triggered deterministic signal(s)` +
        (mlScore !== null ? ` and an ML score of ${mlScore.toFixed(2)}` : ", with no ML score available") +
        `. Sanctions screening: ${confirmedSanctionsMatch ? "CONFIRMED_MATCH" : potentialSanctionsMatch ? "POTENTIAL_MATCH" : "CLEAR"}.`,
      redFlags: evidenceIds.slice(0, 3),
      supportingEvidence: evidenceIds,
      contradictoryEvidence: [],
      recommendedNextSteps: [
        "Verify findings with the customer or documented source of funds.",
        "Confirm this is consistent with a demo/synthetic run before treating as real evidence.",
      ],
      mlScoreAssessment:
        mlScore !== null
          ? `ML score of ${mlScore.toFixed(2)} is one input among several; not treated as a standalone determination.`
          : "No ML score was available for this alert; assessment relies on deterministic evidence only.",
      investigationSummary: "[DEMO MODE] This is a deterministic, synthetic investigation summary — not a real Claude response.",
    });

    return { rawText, provider: this.providerName, model: "demo-deterministic-v1", promptVersion: PROMPT_VERSION };
  }
}
