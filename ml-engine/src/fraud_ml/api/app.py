"""The prediction API boundary: POST /api/ml/predict. This is the one place
the Next.js app (or n8n, or anything else) is expected to talk to — nothing
about deterministic signals, feature engineering, or which provider produced
a score should need to leak past this module.

Safe failure: an ML/anomaly model failure never produces a 500 and never
fabricates a score. The response's `status` field is "degraded" and
`errors` names what failed, but `risk_signals` (deterministic evidence) and
`risk_assessment` are always populated so a human investigation can proceed.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from fraud_ml.features.prediction import build_prediction_features
from fraud_ml.fusion import fuse_risk, run_ml_provider_safely
from fraud_ml.models.registry import ModelRegistry
from fraud_ml.providers.local_provider import LocalMLProvider
from fraud_ml.risk_engine.engine import DeterministicRiskEngine
from fraud_ml.schemas import (
    AnomalyResult,
    FeatureSummary,
    PredictRequest,
    PredictResponse,
    SupervisedResult,
)

logger = logging.getLogger("fraud_ml.api")

app = FastAPI(title="Fraud Detection Engine", version="0.1.0")

_registry = ModelRegistry()
_engine = DeterministicRiskEngine()
_supervised_provider = LocalMLProvider(_registry)

# Anomaly models are optional — the API works with zero of them registered
# (anomaly_results comes back empty, which is not a failure state).
_ANOMALY_MODEL_NAMES = ("isolation-forest", "local-outlier-factor", "one-class-svm", "kmeans-anomaly")


@app.get("/api/ml/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ml/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    transaction = request.transaction
    customer = request.customer

    # Defensive guard mentioned in schemas.PredictRequest: never let a
    # caller-supplied "history" item at or after the transaction being
    # scored leak into feature computation.
    history = [t for t in request.recent_transactions if t.transaction_at < transaction.transaction_at]

    errors: list[str] = []

    signals = _engine.evaluate(transaction, customer, history)
    features = build_prediction_features(transaction, customer, history)

    anomaly_results: list[AnomalyResult] = []
    for model_name in _ANOMALY_MODEL_NAMES:
        entry = _registry.latest(model_name, status=None)
        if entry is None:
            continue
        try:
            import pandas as pd

            from fraud_ml.features.prediction import FEATURE_NAMES

            model = _registry.load_model(entry.model_name, entry.version)
            X = pd.DataFrame([[features[name] for name in FEATURE_NAMES]], columns=list(FEATURE_NAMES))
            score = float(model.score_samples(X)[0])
            anomaly_results.append(
                AnomalyResult(
                    model_name=entry.model_name,
                    algorithm=entry.model_type,
                    anomaly_score=score,
                    is_anomaly=score >= 0.5,
                )
            )
        except Exception as exc:  # noqa: BLE001 - an anomaly-model failure degrades, it doesn't fail the request
            logger.warning("Anomaly model %s failed: %s", model_name, exc)
            errors.append(f"Anomaly model {model_name!r} unavailable: {exc}")

    ml_result, ml_error = run_ml_provider_safely(_supervised_provider, transaction, customer, history)
    if ml_error:
        errors.append(f"Supervised model unavailable: {ml_error}")

    supervised_results: list[SupervisedResult] = []
    if ml_result is not None:
        supervised_results.append(
            SupervisedResult(
                model_name=ml_result.model_name,
                algorithm=ml_result.metadata.get("algorithm", "unknown"),
                score=ml_result.score,
                model_version=ml_result.model_version,
                provider=ml_result.provider,
            )
        )

    risk_assessment = fuse_risk(signals, customer, ml_result)

    return PredictResponse(
        status="ok" if ml_result is not None else "degraded",
        risk_signals=signals,
        feature_summary=FeatureSummary(features=features),
        anomaly_results=anomaly_results,
        supervised_results=supervised_results,
        ml_prediction=ml_result,
        risk_assessment=risk_assessment,
        errors=errors,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):  # noqa: ANN001, ARG001
    # Last-resort safety net: even an unexpected bug in this service must not
    # look like a successful prediction — surface a clear 500 rather than a
    # silently wrong score, so callers route to human review instead of
    # trusting a broken response.
    logger.exception("Unhandled error in fraud_ml API")
    return JSONResponse(status_code=500, content={"status": "error", "detail": "prediction service failure"})
