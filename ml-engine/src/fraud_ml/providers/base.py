"""The provider abstraction. Nothing downstream (the fusion layer, the API)
should need to know or care whether a score came from a locally-registered
XGBoost model or a hosted Hugging Face endpoint — both speak this same
interface and return the same result shape."""
from __future__ import annotations

from abc import ABC, abstractmethod

from fraud_ml.schemas import CustomerContext, MLPredictionResult, TransactionContext, TransactionHistoryItem

# Re-exported for convenience/back-compat with the "PredictionResult" name
# used in the task description — this *is* the ml_predictions-shaped
# contract from fraud_ml.schemas, not a second competing definition.
PredictionResult = MLPredictionResult


class MLInferenceError(Exception):
    """Raised whenever a provider cannot produce a trustworthy score — a
    missing model, a network failure, invalid input, whatever. Callers
    (fraud_ml.fusion, the API layer) MUST catch this and continue with
    deterministic evidence only; they must never invent a placeholder score
    to paper over it. See docs/ML_ENGINE.md "Safe failure"."""


class MLProvider(ABC):
    provider_name: str

    @abstractmethod
    def predict(
        self,
        transaction: TransactionContext,
        customer: CustomerContext,
        history: list[TransactionHistoryItem] | None = None,
    ) -> MLPredictionResult:
        """Raises MLInferenceError on any failure — never returns a
        fabricated score."""
        ...
