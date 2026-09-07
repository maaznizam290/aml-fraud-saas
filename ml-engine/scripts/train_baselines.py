#!/usr/bin/env python3
"""Train the supervised baselines + anomaly models on synthetic data and
register them in the local ModelRegistry. Training is explicitly separate
from inference (see docs/ML_ENGINE.md "Training vs inference") — the
prediction API (fraud_ml.api.app) only ever loads what this script (or a
real training pipeline replacing it) already registered; it never retrains
on the fly.

Usage (from ml-engine/):
    PYTHONPATH=src python scripts/train_baselines.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import sklearn  # noqa: E402
import xgboost  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402
from synthetic_data import generate_synthetic_dataset  # noqa: E402

from fraud_ml.config import settings  # noqa: E402
from fraud_ml.features.training import build_training_dataset  # noqa: E402
from fraud_ml.models.anomaly import (  # noqa: E402
    IsolationForestAnomalyModel,
    KMeansAnomalyModel,
    LocalOutlierFactorAnomalyModel,
    OneClassSVMAnomalyModel,
)
from fraud_ml.models.registry import ModelRegistry, ModelRegistryEntry  # noqa: E402
from fraud_ml.models.supervised import LogisticRegressionBaseline, XGBoostBaseline  # noqa: E402

VERSION = "1.0.0"


def main() -> None:
    print(f"Generating synthetic dataset (seed={settings.random_seed})...")
    transactions, customers = generate_synthetic_dataset(seed=settings.random_seed)
    print(f"  {len(transactions)} transactions, {len(customers)} customers, "
          f"{transactions['is_fraud'].sum()} labeled fraud ({transactions['is_fraud'].mean():.1%})")

    print("Building point-in-time features via DuckDB...")
    X, y = build_training_dataset(transactions, customers)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=settings.random_seed, stratify=y
    )
    print(f"  train={len(X_train)} test={len(X_test)}")

    registry = ModelRegistry()
    training_metadata = {
        "n_train": len(X_train),
        "n_test": len(X_test),
        "feature_names": list(X.columns),
        "random_seed": settings.random_seed,
        "sklearn_version": sklearn.__version__,
        "xgboost_version": xgboost.__version__,
        "data_source": (
            "synthetic (scripts/synthetic_data.py) — replace with real historical data before production use"
        ),
    }

    print("\n--- Supervised baselines ---")
    for cls, name in ((LogisticRegressionBaseline, "logreg-fraud"), (XGBoostBaseline, "xgboost-fraud")):
        model = cls()
        model.fit(X_train, y_train)
        metrics = model.evaluate(X_test, y_test)
        print(f"{name}: precision={metrics.precision:.3f} recall={metrics.recall:.3f} "
              f"f1={metrics.f1:.3f} roc_auc={metrics.roc_auc}")

        entry = ModelRegistryEntry(
            model_name=name,
            version=VERSION,
            provider="local",
            model_type=model.algorithm,
            status="REVIEW",  # promotion to DEPLOYED is a separate, human-governed step
            metrics=metrics.to_dict(),
            configuration={"threshold": 0.5},
            training_metadata=training_metadata,
        )
        try:
            registry.register(entry, model)
            print(f"  registered {entry.key}")
        except ValueError as exc:
            print(f"  skipped registering {entry.key}: {exc}")

    print("\n--- Anomaly models (unsupervised; fit on the full training split) ---")
    anomaly_models = (
        (IsolationForestAnomalyModel, "isolation-forest"),
        (LocalOutlierFactorAnomalyModel, "local-outlier-factor"),
        (OneClassSVMAnomalyModel, "one-class-svm"),
        (KMeansAnomalyModel, "kmeans-anomaly"),
    )
    for cls, name in anomaly_models:
        model = cls()
        model.fit(X_train)
        # Informational only — anomaly scores are unsupervised and this
        # dataset's labels were never shown to the model. Not a benchmark.
        scores = model.score_samples(X_test)
        agreement = float(((scores >= 0.5).astype(int) == y_test.to_numpy()).mean())
        print(f"{name}: fraction flagged anomalous on test={float((scores >= 0.5).mean()):.3f}, "
              f"naive label agreement (informational only)={agreement:.3f}")

        entry = ModelRegistryEntry(
            model_name=name,
            version=VERSION,
            provider="local",
            model_type=model.algorithm,
            status="REVIEW",
            metrics={"informational_label_agreement": agreement},
            configuration={},
            training_metadata=training_metadata,
        )
        try:
            registry.register(entry, model)
            print(f"  registered {entry.key}")
        except ValueError as exc:
            print(f"  skipped registering {entry.key}: {exc}")

    print(f"\nRegistry written to {registry.directory}/registry.json")
    print("All entries are status=REVIEW: promote to DEPLOYED explicitly (a human/governance step), "
          "not automatically by this script.")


if __name__ == "__main__":
    main()
