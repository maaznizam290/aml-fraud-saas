/**
 * Client for the fraud-detection-engine's prediction API
 * (ml-engine/src/fraud_ml/api/app.py — POST /api/ml/predict). Field names
 * sent over the wire are snake_case to match that service's Pydantic
 * schemas exactly (fraud_ml.schemas.PredictRequest) — this is the one
 * place that translation happens, so nothing else in this codebase needs to
 * know the ML service speaks snake_case.
 *
 * Safe failure: this NEVER throws and NEVER fabricates a score. A network
 * error, a timeout, or a non-200 response all produce the same
 * `degraded: true` result shape, which callers (investigationService.ts)
 * are required to handle by continuing on deterministic evidence alone.
 */
import type { CustomerProfile, Customer as CustomerRow, Transaction } from "../supabase/types.js";
import type { MlPredictionEvidenceData, RiskSignalSummary } from "./types.js";

interface RawPredictResponse {
  status: "ok" | "degraded";
  risk_signals: Array<{
    signal_type: string;
    triggered: boolean;
    weight: number;
    explanation: string;
  }>;
  ml_prediction: {
    provider: string;
    model_name: string;
    model_version: string;
    prediction: string;
    score: number;
    confidence: number | null;
  } | null;
  risk_assessment: {
    disposition: "ESCALATE" | "CLEAR" | "REFER";
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    rationale: string;
    ml_contributed: boolean;
  };
  errors: string[];
}

export interface MlClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function toPredictPayload(
  transaction: Transaction,
  customer: CustomerRow,
  profile: CustomerProfile | null,
  history: Transaction[]
) {
  return {
    transaction: {
      customer_id: transaction.customer_id,
      direction: transaction.direction,
      amount: transaction.amount,
      currency: transaction.currency,
      channel: transaction.channel,
      counterparty_account: transaction.counterparty_account,
      counterparty_country: transaction.counterparty_country,
      origin_country: transaction.origin_country,
      destination_country: transaction.destination_country,
      device_id: transaction.device_id,
      device_is_new: transaction.device_is_new,
      transaction_at: transaction.transaction_at,
    },
    customer: {
      id: customer.id,
      risk_rating: customer.risk_rating,
      kyc_status: customer.kyc_status,
      sanctions_status: profile?.sanctions_status ?? "PENDING_REVIEW",
      account_opened_at: customer.account_opened_at,
      average_transaction_amount: profile?.average_transaction_amount ?? null,
      expected_monthly_volume: profile?.expected_monthly_volume ?? null,
      typical_countries: profile?.typical_countries ?? [],
      pep_status: profile?.pep_status ?? false,
    },
    recent_transactions: history.map((t) => ({
      amount: t.amount,
      direction: t.direction,
      counterparty_account: t.counterparty_account,
      counterparty_country: t.counterparty_country,
      destination_country: t.destination_country,
      device_id: t.device_id,
      transaction_at: t.transaction_at,
    })),
  };
}

export async function requestMlPrediction(
  transaction: Transaction,
  customer: CustomerRow,
  profile: CustomerProfile | null,
  history: Transaction[],
  options: MlClientOptions
): Promise<MlPredictionEvidenceData> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const response = await doFetch(`${options.baseUrl.replace(/\/$/, "")}/api/ml/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toPredictPayload(transaction, customer, profile, history)),
      signal: controller.signal,
    });

    if (!response.ok) {
      return degraded(`ML service returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as RawPredictResponse;
    const riskSignals: RiskSignalSummary[] = body.risk_signals.map((s) => ({
      signalType: s.signal_type as RiskSignalSummary["signalType"],
      triggered: s.triggered,
      weight: s.weight,
      explanation: s.explanation,
    }));

    if (!body.ml_prediction) {
      // The ML service itself degraded (e.g. no model registered) — still a
      // valid, non-fabricated response: risk_signals/risk_assessment came
      // from its deterministic engine, just with no ML score layered on.
      return {
        provider: "none",
        modelName: "none",
        modelVersion: "none",
        prediction: "UNAVAILABLE",
        score: 0,
        confidence: null,
        riskSignals,
        riskAssessment: {
          disposition: body.risk_assessment.disposition,
          riskLevel: body.risk_assessment.risk_level,
          rationale: body.risk_assessment.rationale,
          mlContributed: body.risk_assessment.ml_contributed,
        },
        degraded: true,
        error: body.errors.join("; ") || "ML service returned no prediction",
      };
    }

    return {
      provider: body.ml_prediction.provider,
      modelName: body.ml_prediction.model_name,
      modelVersion: body.ml_prediction.model_version,
      prediction: body.ml_prediction.prediction,
      score: body.ml_prediction.score,
      confidence: body.ml_prediction.confidence,
      riskSignals,
      riskAssessment: {
        disposition: body.risk_assessment.disposition,
        riskLevel: body.risk_assessment.risk_level,
        rationale: body.risk_assessment.rationale,
        mlContributed: body.risk_assessment.ml_contributed,
      },
      degraded: false,
    };
  } catch (err) {
    return degraded(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

function degraded(error: string): MlPredictionEvidenceData {
  return {
    provider: "none",
    modelName: "none",
    modelVersion: "none",
    prediction: "UNAVAILABLE",
    score: 0,
    confidence: null,
    riskSignals: [],
    riskAssessment: null,
    degraded: true,
    error,
  };
}
