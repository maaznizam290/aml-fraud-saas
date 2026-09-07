"""Common interfaces so callers (the provider layer, the training script)
never need to know which concrete algorithm they're talking to."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd


class AnomalyModel(ABC):
    """Unsupervised/experimental. `anomaly_score` is normalized to roughly
    [0, 1] (higher = more anomalous) so different algorithms are at least
    comparable at a glance — it is NOT a calibrated probability, and must
    never be presented as one. See PredictionResult/AnomalyResult docs."""

    name: str
    algorithm: str

    @abstractmethod
    def fit(self, X: pd.DataFrame) -> AnomalyModel: ...

    @abstractmethod
    def score_samples(self, X: pd.DataFrame) -> np.ndarray:
        """Higher = more anomalous, normalized to [0, 1]."""
        ...

    def predict(self, X: pd.DataFrame, threshold: float = 0.5) -> np.ndarray:
        return self.score_samples(X) >= threshold


class SupervisedModel(ABC):
    """Supervised baseline. `predict_proba` must return calibrated-ish
    fraud-class probabilities in [0, 1]."""

    name: str
    algorithm: str

    @abstractmethod
    def fit(self, X: pd.DataFrame, y: pd.Series) -> SupervisedModel: ...

    @abstractmethod
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray: ...

    def predict(self, X: pd.DataFrame, threshold: float = 0.5) -> np.ndarray:
        return self.predict_proba(X) >= threshold

    def evaluate(self, X: pd.DataFrame, y: pd.Series, threshold: float = 0.5) -> EvaluationMetrics:
        """Evaluate against a held-out (X, y) — callers are responsible for
        actually holding it out (see scripts/train_baselines.py for a
        train/test split); this method has no way to enforce that itself."""
        from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score

        proba = self.predict_proba(X)
        preds = proba >= threshold
        y_arr = np.asarray(y)

        roc_auc = None
        if len(set(y_arr.tolist())) > 1:
            roc_auc = float(roc_auc_score(y_arr, proba))

        cm = confusion_matrix(y_arr, preds, labels=[0, 1])

        return EvaluationMetrics(
            precision=float(precision_score(y_arr, preds, zero_division=0)),
            recall=float(recall_score(y_arr, preds, zero_division=0)),
            f1=float(f1_score(y_arr, preds, zero_division=0)),
            roc_auc=roc_auc,
            confusion_matrix=cm.tolist(),
            threshold=threshold,
            n_samples=len(y_arr),
            n_positive=int(y_arr.sum()),
            config={"model_name": self.name, "algorithm": self.algorithm},
        )


@dataclass
class EvaluationMetrics:
    """Reproducible evaluation summary — see models/supervised.py's
    `evaluate()`. Never claim a benchmark number without one of these behind
    it, computed against a held-out split."""

    precision: float
    recall: float
    f1: float
    roc_auc: float | None
    confusion_matrix: list[list[int]]
    threshold: float
    n_samples: int
    n_positive: int
    config: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "roc_auc": self.roc_auc,
            "confusion_matrix": self.confusion_matrix,
            "threshold": self.threshold,
            "n_samples": self.n_samples,
            "n_positive": self.n_positive,
            "config": self.config,
        }
