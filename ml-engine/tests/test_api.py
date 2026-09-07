from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import fraud_ml.api.app as app_module
from fraud_ml.models.registry import ModelRegistry, ModelRegistryEntry
from fraud_ml.models.supervised import LogisticRegressionBaseline
from fraud_ml.providers.local_provider import LocalMLProvider

VALID_PAYLOAD = {
    "transaction": {
        "customer_id": "cust_1",
        "direction": "OUTBOUND",
        "amount": 250.0,
        "channel": "ACH",
        "counterparty_account": "acct_known",
        "counterparty_country": "US",
        "destination_country": "US",
        "device_id": "device_known",
        "device_is_new": False,
        "transaction_at": "2024-06-01T12:00:00Z",
    },
    "customer": {
        "id": "cust_1",
        "risk_rating": "LOW",
        "kyc_status": "VERIFIED",
        "sanctions_status": "CLEAR",
        "account_opened_at": "2022-01-01T00:00:00Z",
        "average_transaction_amount": 240.0,
    },
    "recent_transactions": [
        {
            "amount": 230.0,
            "direction": "OUTBOUND",
            "counterparty_account": "acct_known",
            "counterparty_country": "US",
            "destination_country": "US",
            "device_id": "device_known",
            "transaction_at": "2024-05-01T12:00:00Z",
        }
    ],
}


@pytest.fixture()
def isolated_registry(tmp_path, monkeypatch):
    """Point the API's module-level singletons at a throwaway registry so
    tests never depend on (or pollute) whatever a real training run left in
    the default artifacts directory."""
    registry = ModelRegistry(tmp_path)
    monkeypatch.setattr(app_module, "_registry", registry)
    monkeypatch.setattr(app_module, "_supervised_provider", LocalMLProvider(registry, model_name="xgboost-fraud"))
    return registry


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app_module.app)


def test_health(client):
    resp = client.get("/api/ml/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


class TestPredictSafeFailure:
    def test_predict_degrades_gracefully_with_no_model_registered(self, client, isolated_registry):
        resp = client.post("/api/ml/predict", json=VALID_PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "degraded"
        assert body["ml_prediction"] is None
        assert body["errors"]
        # deterministic evidence must still be fully present
        assert len(body["risk_signals"]) == 13
        assert body["risk_assessment"]["disposition"] in {"ESCALATE", "CLEAR", "REFER"}


class TestPredictWithModel:
    def test_predict_returns_ok_with_a_registered_model(self, client, isolated_registry):
        from fraud_ml.features.prediction import FEATURE_NAMES

        X = pd.DataFrame([[0.0] * len(FEATURE_NAMES)] * 20, columns=list(FEATURE_NAMES))
        y = pd.Series([0, 1] * 10)
        model = LogisticRegressionBaseline().fit(X, y)
        isolated_registry.register(
            ModelRegistryEntry(
                model_name="xgboost-fraud", version="1.0.0", provider="local",
                model_type="logistic_regression", status="DEPLOYED",
            ),
            model_object=model,
        )

        resp = client.post("/api/ml/predict", json=VALID_PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["ml_prediction"] is not None
        assert body["errors"] == []
        assert len(body["supervised_results"]) == 1


class TestInputValidation:
    def test_missing_required_field_returns_422(self, client, isolated_registry):
        bad_payload = {"transaction": {}, "customer": {}}
        resp = client.post("/api/ml/predict", json=bad_payload)
        assert resp.status_code == 422

    def test_negative_amount_rejected(self, client, isolated_registry):
        payload = {**VALID_PAYLOAD, "transaction": {**VALID_PAYLOAD["transaction"], "amount": -5.0}}
        resp = client.post("/api/ml/predict", json=payload)
        assert resp.status_code == 422

    def test_future_history_entries_are_ignored_not_rejected(self, client, isolated_registry):
        payload = {
            **VALID_PAYLOAD,
            "recent_transactions": [
                {
                    "amount": 999999.0,
                    "direction": "OUTBOUND",
                    "transaction_at": "2099-01-01T00:00:00Z",  # after the scored transaction
                }
            ],
        }
        resp = client.post("/api/ml/predict", json=payload)
        assert resp.status_code == 200
        # the absurd future amount must not have influenced the feature summary
        assert resp.json()["feature_summary"]["features"]["history_size"] == 0.0
