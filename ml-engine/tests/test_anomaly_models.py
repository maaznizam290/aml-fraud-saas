from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from fraud_ml.models.anomaly import (
    IsolationForestAnomalyModel,
    KMeansAnomalyModel,
    LocalOutlierFactorAnomalyModel,
    OneClassSVMAnomalyModel,
)

ANOMALY_MODEL_CLASSES = [
    IsolationForestAnomalyModel,
    LocalOutlierFactorAnomalyModel,
    OneClassSVMAnomalyModel,
    KMeansAnomalyModel,
]


def _toy_data(seed: int = 0) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    inliers = rng.normal(loc=0.0, scale=1.0, size=(200, 3))
    outliers = rng.normal(loc=15.0, scale=1.0, size=(5, 3))
    train = pd.DataFrame(inliers, columns=["a", "b", "c"])
    test = pd.DataFrame(np.vstack([inliers[:20], outliers]), columns=["a", "b", "c"])
    return train, test


@pytest.mark.parametrize("model_cls", ANOMALY_MODEL_CLASSES)
class TestAnomalyModelInterface:
    def test_scores_are_normalized_to_unit_interval(self, model_cls):
        train, test = _toy_data()
        model = model_cls().fit(train)
        scores = model.score_samples(test)
        assert scores.min() >= 0.0
        assert scores.max() <= 1.0

    def test_obvious_outliers_score_higher_than_inliers(self, model_cls):
        train, test = _toy_data()
        model = model_cls().fit(train)
        scores = model.score_samples(test)
        inlier_scores = scores[:20]
        outlier_scores = scores[20:]
        assert outlier_scores.mean() > inlier_scores.mean()

    def test_predict_uses_threshold(self, model_cls):
        train, test = _toy_data()
        model = model_cls().fit(train)
        predictions = model.predict(test, threshold=0.9)
        assert predictions.dtype == bool
        # obvious outliers should be flagged at a strict threshold
        assert predictions[-5:].any()

    def test_has_name_and_algorithm(self, model_cls):
        model = model_cls()
        assert isinstance(model.name, str) and model.name
        assert isinstance(model.algorithm, str) and model.algorithm
