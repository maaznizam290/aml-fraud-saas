"""The default provider: a locally-registered scikit-learn/XGBoost model
loaded from the ModelRegistry, run in-process. See scripts/train_baselines.py
for how a model actually gets registered."""
from __future__ import annotations

from datetime import UTC, datetime

from fraud_ml.features.prediction import FEATURE_NAMES, build_prediction_features
from fraud_ml.models.registry import ModelRegistry, ModelRegistryEntry
from fraud_ml.providers.base import MLInferenceError, MLProvider
from fraud_ml.schemas import CustomerContext, MLPredictionResult, TransactionContext, TransactionHistoryItem


class LocalMLProvider(MLProvider):
    provider_name = "local"

    def __init__(
        self, registry: ModelRegistry | None = None, model_name: str = "xgboost-fraud", version: str | None = None
    ):
        self._registry = registry or ModelRegistry()
        self._model_name = model_name
        self._requested_version = version
        self._cache: dict[str, tuple[ModelRegistryEntry, object]] = {}

    def _resolve_entry(self) -> ModelRegistryEntry:
        if self._requested_version:
            entry = self._registry.get_entry(self._model_name, self._requested_version)
        else:
            entry = self._registry.latest(self._model_name, status="DEPLOYED") or self._registry.latest(
                self._model_name, status=None
            )
        if entry is None:
            raise MLInferenceError(
                f"No registered model found for {self._model_name!r} "
                f"(version={self._requested_version or 'latest'}). Run scripts/train_baselines.py first."
            )
        return entry

    def _resolve_model(self):
        entry = self._resolve_entry()
        if entry.key not in self._cache:
            try:
                model = self._registry.load_model(entry.model_name, entry.version)
            except Exception as exc:  # noqa: BLE001 - deliberately broad: any load failure is an inference failure
                raise MLInferenceError(f"Failed to load model {entry.key!r}: {exc}") from exc
            self._cache[entry.key] = (entry, model)
        return self._cache[entry.key]

    def predict(
        self,
        transaction: TransactionContext,
        customer: CustomerContext,
        history: list[TransactionHistoryItem] | None = None,
    ) -> MLPredictionResult:
        entry, model = self._resolve_model()

        features = build_prediction_features(transaction, customer, history)
        try:
            import pandas as pd

            X = pd.DataFrame([[features[name] for name in FEATURE_NAMES]], columns=list(FEATURE_NAMES))
            score = float(model.predict_proba(X)[0])
        except MLInferenceError:
            raise
        except Exception as exc:  # noqa: BLE001 - any inference-time failure must not fabricate a score
            raise MLInferenceError(f"Inference failed for model {entry.key!r}: {exc}") from exc

        prediction_label = "FRAUD_LIKELY" if score >= 0.5 else "FRAUD_UNLIKELY"

        return MLPredictionResult(
            provider=self.provider_name,
            model_name=entry.model_name,
            model_version=entry.version,
            prediction=prediction_label,
            score=score,
            confidence=None,
            features=features,
            metadata={"algorithm": entry.model_type, "status": entry.status},
            created_at=datetime.now(UTC),
        )
