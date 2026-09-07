from __future__ import annotations

import pandas as pd
import pytest

from fraud_ml.fusion import run_ml_provider_safely
from fraud_ml.models.registry import ModelRegistry, ModelRegistryEntry
from fraud_ml.models.supervised import LogisticRegressionBaseline
from fraud_ml.providers.base import MLInferenceError
from fraud_ml.providers.huggingface_provider import HuggingFaceMLProvider
from fraud_ml.providers.local_provider import LocalMLProvider

from .conftest import make_customer, make_regular_history, make_transaction


class TestLocalMLProviderSafeFailure:
    def test_raises_ml_inference_error_when_no_model_registered(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        provider = LocalMLProvider(registry, model_name="does-not-exist")
        with pytest.raises(MLInferenceError):
            provider.predict(make_transaction(), make_customer(), make_regular_history())

    def test_run_ml_provider_safely_never_raises(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        provider = LocalMLProvider(registry, model_name="does-not-exist")
        result, error = run_ml_provider_safely(provider, make_transaction(), make_customer(), make_regular_history())
        assert result is None
        assert error is not None and "does-not-exist" in error


class TestLocalMLProviderSuccess:
    def test_predicts_with_a_registered_model(self, tmp_path):
        from fraud_ml.features.prediction import FEATURE_NAMES

        registry = ModelRegistry(tmp_path)
        X = pd.DataFrame([[0.0] * len(FEATURE_NAMES)] * 20, columns=list(FEATURE_NAMES))
        y = pd.Series([0, 1] * 10)
        model = LogisticRegressionBaseline().fit(X, y)

        registry.register(
            ModelRegistryEntry(
                model_name="xgboost-fraud", version="1.0.0", provider="local",
                model_type="logistic_regression", status="DEPLOYED",
            ),
            model_object=model,
        )

        provider = LocalMLProvider(registry, model_name="xgboost-fraud")
        result = provider.predict(make_transaction(), make_customer(), make_regular_history())

        assert result.provider == "local"
        assert result.model_name == "xgboost-fraud"
        assert result.model_version == "1.0.0"
        assert 0.0 <= result.score <= 1.0
        assert result.prediction in {"FRAUD_LIKELY", "FRAUD_UNLIKELY"}
        assert set(result.features.keys()) == set(FEATURE_NAMES)

    def test_prefers_deployed_over_review_version(self, tmp_path):
        from fraud_ml.features.prediction import FEATURE_NAMES

        registry = ModelRegistry(tmp_path)
        X = pd.DataFrame([[0.0] * len(FEATURE_NAMES)] * 20, columns=list(FEATURE_NAMES))
        y = pd.Series([0, 1] * 10)
        model = LogisticRegressionBaseline().fit(X, y)

        registry.register(
            ModelRegistryEntry(model_name="m", version="2.0.0", provider="local", model_type="logistic_regression", status="REVIEW"),
            model_object=model,
        )
        registry.register(
            ModelRegistryEntry(model_name="m", version="1.0.0", provider="local", model_type="logistic_regression", status="DEPLOYED"),
            model_object=model,
        )

        provider = LocalMLProvider(registry, model_name="m")
        result = provider.predict(make_transaction(), make_customer(), make_regular_history())
        assert result.model_version == "1.0.0"


class TestHuggingFaceProviderSafeFailure:
    def test_raises_when_unconfigured(self):
        provider = HuggingFaceMLProvider(model_id=None, api_token=None)
        with pytest.raises(MLInferenceError):
            provider.predict(make_transaction(), make_customer(), make_regular_history())

    def test_run_safely_degrades_gracefully(self):
        provider = HuggingFaceMLProvider(model_id=None, api_token=None)
        result, error = run_ml_provider_safely(provider, make_transaction(), make_customer(), make_regular_history())
        assert result is None
        assert error is not None
