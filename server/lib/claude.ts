import Anthropic from "@anthropic-ai/sdk";
import type { AlertWithTransaction, RuleCondition } from "../types.js";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude response did not contain a JSON object");
  return JSON.parse(match[0]) as T;
}

/**
 * Produces the "Hermes Agent Synthesis": a short, plain-English brief an
 * analyst reads before deciding on a grey-area alert. This is advisory
 * text only — it never decides anything on its own (see project Critical
 * Rule: AI recommendations must always be reviewable by a human analyst).
 *
 * Falls back to a template-generated brief when ANTHROPIC_API_KEY is not
 * configured, so the investigation workflow still functions end-to-end in
 * a demo/offline environment.
 */
export async function generateInvestigationBrief(params: {
  transactionId: string;
  amountPkr: number;
  fraudProbability: number;
  features: Record<string, number>;
  scoreSource: "ml-engine" | "fallback-heuristic";
}): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) {
    return (
      `Transaction ${params.transactionId} (PKR ${params.amountPkr.toLocaleString()}) scored ` +
      `${(params.fraudProbability * 100).toFixed(0)}% fraud probability via ${params.scoreSource}. ` +
      `Key contributing features: ${Object.entries(params.features)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}. This transaction requires manual analyst review before any action is taken.`
    );
  }

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content:
          "You are an AML compliance analyst assistant. Given the transaction risk data below, " +
          "write a concise, plain-English investigation brief of EXACTLY three sentences for a human " +
          "analyst who will decide whether to approve or block this transaction. Do not recommend a " +
          "final decision yourself — describe the risk signals and why they matter. " +
          "Respond with ONLY a JSON object: {\"brief\": \"<three sentence string>\"}.\n\n" +
          JSON.stringify(params),
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const parsed = extractJson<{ brief: string }>(text);
  return parsed.brief;
}

export interface ProposedHermesRule {
  rule_name: string;
  conditions: RuleCondition;
  rationale: string;
}

/**
 * Asks Claude to propose new declarative heuristic rules by analyzing where
 * the ML engine's score disagreed with the analyst's final, confirmed
 * decision on resolved alerts. Rules returned here are ALWAYS created with
 * status PENDING (see server/routes/hermes.ts) — Hermes never deploys a
 * rule itself, and this function has no path to mutate live data.
 */
export async function synthesizeHermesRules(
  resolvedAlerts: AlertWithTransaction[],
): Promise<ProposedHermesRule[]> {
  const anthropic = getClient();

  const disagreements = resolvedAlerts.map((alert) => ({
    transaction_id: alert.transaction.id,
    amount_pkr: alert.transaction.amount_pkr,
    ml_score: alert.transaction.ml_score,
    features: alert.transaction.ml_features,
    analyst_decision: alert.status,
  }));

  if (!anthropic) {
    return [
      {
        rule_name: "Fallback: Large transfer from very new account",
        conditions: {
          all: [
            { field: "amount_pkr", op: "gt", value: 50000 },
            { field: "account_age_days", op: "lt", value: 3 },
          ],
        },
        rationale:
          "ANTHROPIC_API_KEY is not configured, so this is a template rule mirroring the platform's " +
          "structural fallback heuristic rather than a Claude-synthesized proposal.",
      },
    ];
  }

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          "You are the Hermes rule-synthesis agent for an AML fraud platform. Below is a list of " +
          "recently resolved alerts: each includes the ML engine's fraud score, the transaction's risk " +
          "features, and the human analyst's final decision (RESOLVED_APPROVED or RESOLVED_BLOCKED). " +
          "Find patterns where the analyst's decision suggests the ML engine was miscalibrated, and " +
          "propose 1-3 new declarative heuristic rules that would have caught those cases. " +
          "Each rule's conditions must use ONLY these fields: amount_pkr, velocity_last_24h, " +
          "account_age_days, device_risk_score, and ONLY these operators: gt, gte, lt, lte, eq, " +
          "combined with \"all\" (AND) / \"any\" (OR) groups. " +
          'Respond with ONLY a JSON object: {"rules": [{"rule_name": "...", "conditions": {...}, "rationale": "..."}]}.\n\n' +
          JSON.stringify(disagreements),
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const parsed = extractJson<{ rules: ProposedHermesRule[] }>(text);
  return parsed.rules;
}
