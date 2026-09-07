from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from fraud_ml.models.base import EvaluationMetrics
from fraud_ml.models.supervised import LogisticRegressionBaseline, XGBoostBaseline

SUPERVISED_MODEL_CLASSES = [LogisticRegressionBaseline, XGBoostBaseline]


def _separable_dataset(seed: int = 0, n: int = 400):
    rng = np.random.default_rng(seed)
    y = rng.integers(0, 2, size=n)
    # feature strongly correlated with label, plus noise features
    f1 = y * 5.0 + rng.normal(0, 1.0, size=n)
    f2 = rng.normal(0, 1.0, size=n)
    f3 = rng.normal(0, 1.0, size=n)
    X = pd.DataFrame({"f1": f1, "f2": f2, "f3": f3})
    y = pd.Series(y, name="label")
    split = int(n * 0.7)
    return X.iloc[:split], y.iloc[:split], X.iloc[split:], y.iloc[split:]


@pytest.mark.parametrize("model_cls", SUPERVISED_MODEL_CLASSES)
class TestSupervisedModelInterface:
    def test_fit_predict_proba_returns_unit_interval_scores(self, model_cls):
        X_train, y_train, X_test, _ = _separable_dataset()
        model = model_cls().fit(X_train, y_train)
        proba = model.predict_proba(X_test)
        assert proba.min() >= 0.0
        assert proba.max() <= 1.0

    def test_evaluate_returns_reasonable_metrics_on_separable_data(self, model_cls):
        X_train, y_train, X_test, y_test = _separable_dataset()
        model = model_cls().fit(X_train, y_train)
        metrics = model.evaluate(X_test, y_test)
        assert isinstance(metrics, EvaluationMetrics)
        assert metrics.roc_auc is not None and metrics.roc_auc > 0.8
        assert metrics.n_samples == len(y_test)
        assert metrics.n_positive == int(y_test.sum())
        assert len(metrics.confusion_matrix) == 2 and len(metrics.confusion_matrix[0]) == 2

    def test_evaluate_metrics_serialize_to_dict(self, model_cls):
        X_train, y_train, X_test, y_test = _separable_dataset()
        model = model_cls().fit(X_train, y_train)
        metrics = model.evaluate(X_test, y_test)
        d = metrics.to_dict()
        assert set(d.keys()) == {
            "precision", "recall", "f1", "roc_auc", "confusion_matrix", "threshold", "n_samples", "n_positive", "config",
        }

    def test_handles_single_class_test_set_without_crashing(self, model_cls):
        X_train, y_train, X_test, _ = _separable_dataset()
        model = model_cls().fit(X_train, y_train)
        y_all_zero = pd.Series([0] * len(X_test))
        metrics = model.evaluate(X_test, y_all_zero)
        assert metrics.roc_auc is None  # undefined with a single class present


def test_xgboost_feature_importances_align_with_columns():
    X_train, y_train, _, _ = _separable_dataset()
    model = XGBoostBaseline().fit(X_train, y_train)
    importances = model.feature_importances(list(X_train.columns))
    assert set(importances.keys()) == set(X_train.columns)
    # the informative feature should matter more than pure noise
    assert importances["f1"] > importances["f2"]
