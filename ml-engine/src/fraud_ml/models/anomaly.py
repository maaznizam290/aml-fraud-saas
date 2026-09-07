"""Experimental anomaly models. All four share the same shape: fit on
(mostly-normal) historical data, then score_samples() new transactions.
Scores are min-max normalized against the *training* score distribution so
they're comparable across algorithms — but they remain unsupervised,
unlabeled, experimental signals, never a regulatory-grade determination on
their own (see AnomalyResult.note and docs/ML_ENGINE.md)."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from sklearn.svm import OneClassSVM

from fraud_ml.config import settings
from fraud_ml.models.base import AnomalyModel


def _normalize(raw: np.ndarray, lo: float, hi: float) -> np.ndarray:
    if hi <= lo:
        return np.zeros_like(raw)
    return np.clip((raw - lo) / (hi - lo), 0.0, 1.0)


class IsolationForestAnomalyModel(AnomalyModel):
    algorithm = "isolation_forest"

    def __init__(self, name: str = "isolation-forest", **kwargs):
        self.name = name
        self._scaler = StandardScaler()
        self._model = IsolationForest(random_state=settings.random_seed, **kwargs)
        self._lo = 0.0
        self._hi = 1.0

    def fit(self, X: pd.DataFrame) -> IsolationForestAnomalyModel:
        Xs = self._scaler.fit_transform(X)
        self._model.fit(Xs)
        # decision_function: higher = more normal, so negate for "higher = more anomalous"
        raw = -self._model.decision_function(Xs)
        self._lo, self._hi = float(raw.min()), float(raw.max())
        return self

    def score_samples(self, X: pd.DataFrame) -> np.ndarray:
        Xs = self._scaler.transform(X)
        raw = -self._model.decision_function(Xs)
        return _normalize(raw, self._lo, self._hi)


class LocalOutlierFactorAnomalyModel(AnomalyModel):
    algorithm = "local_outlier_factor"

    def __init__(self, name: str = "local-outlier-factor", n_neighbors: int = 20, **kwargs):
        self.name = name
        self._scaler = StandardScaler()
        self._model = LocalOutlierFactor(n_neighbors=n_neighbors, novelty=True, **kwargs)
        self._lo = 0.0
        self._hi = 1.0

    def fit(self, X: pd.DataFrame) -> LocalOutlierFactorAnomalyModel:
        Xs = self._scaler.fit_transform(X)
        self._model.fit(Xs)
        raw = -self._model.decision_function(Xs)
        self._lo, self._hi = float(raw.min()), float(raw.max())
        return self

    def score_samples(self, X: pd.DataFrame) -> np.ndarray:
        Xs = self._scaler.transform(X)
        raw = -self._model.decision_function(Xs)
        return _normalize(raw, self._lo, self._hi)


class OneClassSVMAnomalyModel(AnomalyModel):
    algorithm = "one_class_svm"

    def __init__(self, name: str = "one-class-svm", nu: float = 0.1, **kwargs):
        self.name = name
        self._scaler = StandardScaler()
        self._model = OneClassSVM(nu=nu, **kwargs)
        self._lo = 0.0
        self._hi = 1.0

    def fit(self, X: pd.DataFrame) -> OneClassSVMAnomalyModel:
        Xs = self._scaler.fit_transform(X)
        self._model.fit(Xs)
        raw = -self._model.decision_function(Xs)
        self._lo, self._hi = float(raw.min()), float(raw.max())
        return self

    def score_samples(self, X: pd.DataFrame) -> np.ndarray:
        Xs = self._scaler.transform(X)
        raw = -self._model.decision_function(Xs)
        return _normalize(raw, self._lo, self._hi)


class KMeansAnomalyModel(AnomalyModel):
    """Not a native anomaly detector — anomaly is proxied as distance to the
    nearest cluster centroid, which is a standard, simple way to get an
    anomaly signal out of KMeans."""

    algorithm = "kmeans_distance"

    def __init__(self, name: str = "kmeans-anomaly", n_clusters: int = 5, **kwargs):
        self.name = name
        self._scaler = StandardScaler()
        self._model = KMeans(n_clusters=n_clusters, random_state=settings.random_seed, n_init="auto", **kwargs)
        self._lo = 0.0
        self._hi = 1.0

    def _distances(self, Xs: np.ndarray) -> np.ndarray:
        return self._model.transform(Xs).min(axis=1)

    def fit(self, X: pd.DataFrame) -> KMeansAnomalyModel:
        Xs = self._scaler.fit_transform(X)
        self._model.fit(Xs)
        raw = self._distances(Xs)
        self._lo, self._hi = float(raw.min()), float(raw.max())
        return self

    def score_samples(self, X: pd.DataFrame) -> np.ndarray:
        Xs = self._scaler.transform(X)
        raw = self._distances(Xs)
        return _normalize(raw, self._lo, self._hi)
