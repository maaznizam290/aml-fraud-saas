"""Supervised fraud-classification baselines. Both implement the same
SupervisedModel interface (fit / predict_proba / predict / evaluate), so
scripts/train_baselines.py and the provider layer treat them identically."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from fraud_ml.config import settings
from fraud_ml.models.base import SupervisedModel


class LogisticRegressionBaseline(SupervisedModel):
    algorithm = "logistic_regression"

    def __init__(self, name: str = "logreg-baseline", **kwargs):
        self.name = name
        self._scaler = StandardScaler()
        params = {"max_iter": 1000, "class_weight": "balanced", "random_state": settings.random_seed}
        params.update(kwargs)
        self._model = LogisticRegression(**params)

    def fit(self, X: pd.DataFrame, y: pd.Series) -> LogisticRegressionBaseline:
        Xs = self._scaler.fit_transform(X)
        self._model.fit(Xs, y)
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        Xs = self._scaler.transform(X)
        return self._model.predict_proba(Xs)[:, 1]


class XGBoostBaseline(SupervisedModel):
    algorithm = "xgboost"

    def __init__(self, name: str = "xgboost-baseline", **kwargs):
        self.name = name
        params = {
            "n_estimators": 200,
            "max_depth": 4,
            "learning_rate": 0.1,
            "eval_metric": "logloss",
            "random_state": settings.random_seed,
        }
        params.update(kwargs)
        self._model = XGBClassifier(**params)

    def fit(self, X: pd.DataFrame, y: pd.Series) -> XGBoostBaseline:
        # XGBoost handles class imbalance via scale_pos_weight rather than a
        # generic class_weight param.
        positives = max(int(y.sum()), 1)
        negatives = max(len(y) - positives, 1)
        self._model.set_params(scale_pos_weight=negatives / positives)
        self._model.fit(X, y)
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self._model.predict_proba(X)[:, 1]

    def feature_importances(self, feature_names: list[str]) -> dict[str, float]:
        return dict(zip(feature_names, (float(v) for v in self._model.feature_importances_)))
