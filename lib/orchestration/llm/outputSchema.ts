/**
 * Server-side validation of Claude's structured investigation output (task
 * section 6). Parsing is strict and total: if the model's response doesn't
 * match this shape, `parseInvestigationOutput` returns a typed failure
 * rather than throwing or guessing — the caller (investigationService.ts)
 * is required to route that to REFER/HUMAN_REVIEW and record the failure in
 * the audit log. Nothing here ever fabricates a missing field.
 */
import { z } from "zod";

export const investigationOutputSchema = z.object({
  disposition: z.enum(["ESCALATE", "CLEAR", "REFER"]),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  rationale: z.string().min(1),
  redFlags: z.array(z.string()),
  supportingEvidence: z.array(z.string()),
  contradictoryEvidence: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
  mlScoreAssessment: z.string(),
  investigationSummary: z.string().min(1),
});

export type ParsedInvestigationOutput = z.infer<typeof investigationOutputSchema>;

export type ParseResult =
  | { ok: true; output: ParsedInvestigationOutput }
  | { ok: false; error: string; rawResponse: string };

/**
 * Accepts either a bare JSON object or JSON embedded in a fenced code block
 * (```json ... ```), since models frequently wrap structured output that
 * way even when explicitly asked not to. Anything else is a parse failure,
 * not a best-effort guess.
 */
export function parseInvestigationOutput(rawResponse: string): ParseResult {
  const candidate = extractJsonCandidate(rawResponse);
  if (candidate === null) {
    return { ok: false, error: "No JSON object found in model response", rawResponse };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (err) {
    return {
      ok: false,
      error: `Response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      rawResponse,
    };
  }

  const result = investigationOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), rawResponse };
  }

  return { ok: true, output: result.data };
}

function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  return trimmed.slice(firstBrace, lastBrace + 1);
}
