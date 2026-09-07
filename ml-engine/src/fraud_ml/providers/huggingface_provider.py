"""Future provider, not wired into the default prediction path (see
LocalMLProvider and fraud_ml.api.app). Calls the Hugging Face Inference API
with the same feature vector LocalMLProvider uses, so a hosted model can be
swapped in without touching the fusion/API layer.

Experimental and unconfigured by default: without HUGGINGFACE_API_TOKEN and
HUGGINGFACE_MODEL_ID set, this raises MLInferenceError immediately rather
than silently falling back to anything — see docs/ML_ENGINE.md "Safe
failure". Never claims a real hosted benchmark result; whoever configures a
model_id here is responsible for that model's own evaluation.
"""
from __future__ import annotations

from datetime import UTC, datetime

import httpx

from fraud_ml.config import settings
from fraud_ml.features.prediction import build_prediction_features
from fraud_ml.providers.base import MLInferenceError, MLProvider
from fraud_ml.schemas import CustomerContext, MLPredictionResult, TransactionContext, TransactionHistoryItem

HF_INFERENCE_URL_TEMPLATE = "https://api-inference.huggingface.co/models/{model_id}"


class HuggingFaceMLProvider(MLProvider):
    provider_name = "huggingface"

    def __init__(self, model_id: str | None = None, api_token: str | None = None, timeout_seconds: float = 10.0):
        self._model_id = model_id or settings.huggingface_model_id
        self._api_token = api_token or settings.huggingface_api_token
        self._timeout_seconds = timeout_seconds

    def predict(
        self,
        transaction: TransactionContext,
        customer: CustomerContext,
        history: list[TransactionHistoryItem] | None = None,
    ) -> MLPredictionResult:
        if not self._model_id or not self._api_token:
            raise MLInferenceError(
                "HuggingFaceMLProvider is not configured (HUGGINGFACE_MODEL_ID / "
                "HUGGINGFACE_API_TOKEN missing). This provider is experimental and "
                "opt-in — LocalMLProvider is the default."
            )

        features = build_prediction_features(transaction, customer, history)

        try:
            response = httpx.post(
                HF_INFERENCE_URL_TEMPLATE.format(model_id=self._model_id),
                headers={"Authorization": f"Bearer {self._api_token}"},
                json={"inputs": features},
                timeout=self._timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MLInferenceError(f"Hugging Face inference call failed: {exc}") from exc

        try:
            score = float(payload["score"]) if isinstance(payload, dict) else float(payload[0]["score"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise MLInferenceError(f"Unexpected Hugging Face response shape: {payload!r}") from exc

        return MLPredictionResult(
            provider=self.provider_name,
            model_name=self._model_id,
            model_version="hosted",
            prediction="FRAUD_LIKELY" if score >= 0.5 else "FRAUD_UNLIKELY",
            score=score,
            confidence=None,
            features=features,
            metadata={"hosted": True},
            created_at=datetime.now(UTC),
        )
