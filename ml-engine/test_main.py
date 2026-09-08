from fastapi.testclient import TestClient

from main import app, score_transaction

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_low_risk_transaction_scores_low():
    result = score_transaction(
        amount_pkr=3000,
        velocity_last_24h=1,
        account_age_days=500,
        device_risk_score=0.05,
    )
    assert result["fraud_probability"] < 0.35


def test_high_risk_transaction_scores_high():
    result = score_transaction(
        amount_pkr=250000,
        velocity_last_24h=8,
        account_age_days=0.5,
        device_risk_score=0.9,
    )
    assert result["fraud_probability"] > 0.85


def test_score_is_deterministic():
    first = score_transaction(
        amount_pkr=80000,
        velocity_last_24h=3,
        account_age_days=2,
        device_risk_score=0.5,
    )
    second = score_transaction(
        amount_pkr=80000,
        velocity_last_24h=3,
        account_age_days=2,
        device_risk_score=0.5,
    )
    assert first["fraud_probability"] == second["fraud_probability"]


def test_score_endpoint_returns_expected_shape():
    response = client.post(
        "/api/v1/score",
        json={
            "transaction_id": "txn_123",
            "amount_pkr": 60000,
            "velocity_last_24h": 2,
            "account_age_days": 1,
            "device_risk_score": 0.5,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["transaction_id"] == "txn_123"
    assert 0.0 <= body["fraud_probability"] <= 1.0
    assert "amount_risk" in body["features"]
    assert body["model_version"] == "mock-xgboost-1.0.0"


def test_score_endpoint_rejects_invalid_input():
    response = client.post(
        "/api/v1/score",
        json={
            "transaction_id": "txn_bad",
            "amount_pkr": -100,
            "velocity_last_24h": 1,
            "account_age_days": 1,
            "device_risk_score": 0.5,
        },
    )
    assert response.status_code == 422
