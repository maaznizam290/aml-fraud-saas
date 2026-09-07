"""Risk fusion: combines deterministic signals, behavioral signals,
KYC/sanctions context, and (when available) an ML score into one explainable
RiskAssessment.

Per CLAUDE.md's Critical Rule and this branch's task description, the final
assessment must never depend solely on ML, and it must never be — or imply —
an autonomous adverse action. Concretely:

- The deterministic signals (fraud_ml.risk_engine) already fold in
  behavioral signals (HISTORICAL_BEHAVIOR, ACCOUNT_AGE, TRANSACTION_FREQUENCY,
  VELOCITY_ANOMALY) and KYC/sanctions context (KYC_STATUS, SANCTIONS_RESULT,
  CUSTOMER_RISK) as first-class signal types, not an ML side-channel.
- The combined score always keeps deterministic evidence at >= 60% of the
  weight when ML is available, and falls back to deterministic-only
  (`ml_contributed=False`) when it is not — see the MLInferenceError handling
  in `assess()`.
- The only output is a Disposition (ESCALATE | CLEAR | REFER):
  recommendations for a human analyst, never a decision.
"""
from __future__ import annotations

from fraud_ml.config import settings
from fraud_ml.providers.base import MLInferenceError, MLProvider
from fraud_ml.risk_engine.engine import DeterministicRiskEngine
from fraud_ml.schemas import (
    CustomerContext,
    Disposition,
    MLPredictionResult,
    RiskAssessment,
    RiskLevel,
    RiskSignalResult,
    SanctionsStatus,
    TransactionContext,
    TransactionHistoryItem,
)

DETERMINISTIC_WEIGHT_WITH_ML = 0.6
ML_WEIGHT_WITH_ML = 0.4


def _risk_level(score: float) -> RiskLevel:
    if score >= 0.85:
        return RiskLevel.CRITICAL
    if score >= 0.65:
        return RiskLevel.HIGH
    if score >= 0.35:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def fuse_risk(
    signals: list[RiskSignalResult],
    customer: CustomerContext,
    ml_result: MLPredictionResult | None,
) -> RiskAssessment:
    deterministic_score = DeterministicRiskEngine.aggregate_score(signals)
    ml_contributed = ml_result is not None

    combined = (
        min(1.0, DETERMINISTIC_WEIGHT_WITH_ML * deterministic_score + ML_WEIGHT_WITH_ML * ml_result.score)
        if ml_contributed
        else deterministic_score
    )

    # A confirmed sanctions match always escalates, regardless of the
    # blended score — this is a policy floor, not an ML decision.
    confirmed_sanctions_match = customer.sanctions_status == SanctionsStatus.CONFIRMED_MATCH

    if confirmed_sanctions_match or combined >= settings.escalate_threshold:
        disposition = Disposition.ESCALATE
    elif combined >= settings.review_threshold:
        disposition = Disposition.REFER
    else:
        disposition = Disposition.CLEAR

    contributing = [s.signal_type for s in signals if s.triggered]

    rationale_parts = [
        f"Deterministic risk engine max triggered weight: {deterministic_score:.2f} "
        f"across {len(contributing)} triggered signal(s)."
    ]
    if ml_contributed:
        rationale_parts.append(
            f"ML model ({ml_result.provider}/{ml_result.model_name}@{ml_result.model_version}) "
            f"score: {ml_result.score:.2f}, blended {int(DETERMINISTIC_WEIGHT_WITH_ML * 100)}/"
            f"{int(ML_WEIGHT_WITH_ML * 100)} deterministic/ML."
        )
    else:
        rationale_parts.append("No ML score available for this assessment — deterministic evidence only.")
    if confirmed_sanctions_match:
        rationale_parts.append("Confirmed sanctions match forces escalation regardless of blended score.")
    rationale_parts.append(
        f"Combined score {combined:.2f} maps to disposition {disposition.value} "
        f"(escalate >= {settings.escalate_threshold}, refer >= {settings.review_threshold})."
    )

    confidence = 0.85 if ml_contributed else 0.6

    return RiskAssessment(
        disposition=disposition,
        risk_level=_risk_level(combined),
        confidence=confidence,
        rationale=" ".join(rationale_parts),
        contributing_signals=contributing,
        ml_contributed=ml_contributed,
    )


def run_ml_provider_safely(
    provider: MLProvider,
    transaction: TransactionContext,
    customer: CustomerContext,
    history: list[TransactionHistoryItem] | None,
) -> tuple[MLPredictionResult | None, str | None]:
    """Never lets an ML failure propagate as a fabricated score. Returns
    (result, error_message) — exactly one of which is not None. Investigation
    can and must continue on deterministic evidence alone when this returns
    (None, <message>)."""
    try:
        return provider.predict(transaction, customer, history), None
    except MLInferenceError as exc:
        return None, str(exc)
