import type { TransactionFeatures } from "../types.js";

const ML_ENGINE_URL = process.env.ML_ENGINE_URL ?? "http://localhost:8000";
const ML_ENGINE_TIMEOUT_MS = Number(process.env.ML_ENGINE_TIMEOUT_MS ?? 2000);

export interface ScoreInput extends TransactionFeatures {
  transactionId: string;
  amountPkr: number;
}

export interface ScoreResult {
  fraudProbability: number;
  features: Record<string, number>;
  source: "ml-engine" | "fallback-heuristic";
}

export class MlEngineUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`ML engine at ${ML_ENGINE_URL} is unreachable`);
    this.name = "MlEngineUnavailableError";
    this.cause = cause;
  }
}

/**
 * Calls the FastAPI ML microservice for a fraud probability. Throws
 * MlEngineUnavailableError on any network failure or timeout so callers can
 * fall back to the deterministic heuristic without dropping the checkout
 * flow — the ML engine link is a soft dependency, never a hard one.
 */
export async function scoreViaMlEngine(input: ScoreInput): Promise<ScoreResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_ENGINE_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_ENGINE_URL}/api/v1/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transaction_id: input.transactionId,
        amount_pkr: input.amountPkr,
        velocity_last_24h: input.velocity_last_24h,
        account_age_days: input.account_age_days,
        device_risk_score: input.device_risk_score,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ML engine responded with status ${response.status}`);
    }

    const body = (await response.json()) as {
      fraud_probability: number;
      features: Record<string, number>;
    };

    return {
      fraudProbability: body.fraud_probability,
      features: body.features,
      source: "ml-engine",
    };
  } catch (error) {
    throw new MlEngineUnavailableError(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deterministic fallback used only when the ML engine link is down. Per the
 * platform's structural triage rule: a large transfer (> 50,000 PKR) from a
 * very new account (< 3 days old) is routed to human review (SUSPICIOUS),
 * everything else is treated as low risk. This intentionally never resolves
 * to the auto-BLOCKED band on its own — a heuristic guess without ML
 * confidence should surface for analyst review, not autonomously reject a
 * transaction (consistent with this project's human-in-the-loop rule).
 */
export function scoreViaFallbackHeuristic(input: ScoreInput): ScoreResult {
  const isStructurallyRisky = input.amountPkr > 50_000 && input.account_age_days < 3;
  const fraudProbability = isStructurallyRisky ? 0.6 : 0.2;

  return {
    fraudProbability,
    features: {
      amount_pkr: input.amountPkr,
      account_age_days: input.account_age_days,
      structural_rule_triggered: isStructurallyRisky ? 1 : 0,
    },
    source: "fallback-heuristic",
  };
}

export async function scoreTransaction(input: ScoreInput): Promise<ScoreResult> {
  try {
    return await scoreViaMlEngine(input);
  } catch (error) {
    if (error instanceof MlEngineUnavailableError) {
      return scoreViaFallbackHeuristic(input);
    }
    throw error;
  }
}
