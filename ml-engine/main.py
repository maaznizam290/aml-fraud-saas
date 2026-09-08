"""AML Fraud SaaS — ML scoring microservice.

This service is a deliberate, mathematically-defined stand-in for a trained
XGBoost fraud classifier. It is NOT a trained model: no weights are loaded,
no training data exists. It exists so the rest of the platform (the Express
gateway, the analyst dashboard, Hermes rule synthesis) can be built and
demoed against a stable, deterministic scoring contract today, and swapped
for a real trained model later without changing any caller.

The score is produced by combining four normalized risk features with fixed
weights and squashing the result through a logistic (sigmoid) function, the
same output shape a real XGBoost classifier's predict_proba would return.

Risk features (each normalized to roughly [0, 1] before weighting):
  - amount_risk:  larger transactions are riskier, saturating past 200,000 PKR
  - velocity_risk: more transactions in the trailing window is riskier
  - age_risk:      newer accounts are riskier (inverse of account age in days)
  - device_risk:   caller-supplied device/channel risk signal, already 0-1

Run with: uvicorn main:app --host 0.0.0.0 --port 8000
"""

import math
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="AML Fraud SaaS — ML Scoring Engine",
    description="Deterministic mathematical stand-in for a trained XGBoost fraud classifier.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

# Fixed feature weights for the logistic combination. These stand in for
# feature_importances_ on a trained XGBoost model. Tuned by hand so that:
#   - a small, routine transaction from an established account scores low
#   - a large transfer from a brand-new account with a risky device scores high
_WEIGHTS = {
    "amount_risk": 2.6,
    "velocity_risk": 1.8,
    "age_risk": 2.2,
    "device_risk": 1.4,
}
_BIAS = -3.4  # shifts the sigmoid so a "neutral" transaction scores well under 0.5

_AMOUNT_SATURATION_PKR = 200_000.0
_VELOCITY_SATURATION_COUNT = 10.0
_AGE_SATURATION_DAYS = 30.0


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _amount_risk(amount_pkr: float) -> float:
    return _clamp(amount_pkr / _AMOUNT_SATURATION_PKR)


def _velocity_risk(velocity_last_24h: int) -> float:
    return _clamp(velocity_last_24h / _VELOCITY_SATURATION_COUNT)


def _age_risk(account_age_days: float) -> float:
    return _clamp(1.0 - (account_age_days / _AGE_SATURATION_DAYS))


def _device_risk(device_risk_score: float) -> float:
    return _clamp(device_risk_score)


def score_transaction(
    amount_pkr: float,
    velocity_last_24h: int,
    account_age_days: float,
    device_risk_score: float,
) -> dict:
    features = {
        "amount_risk": _amount_risk(amount_pkr),
        "velocity_risk": _velocity_risk(velocity_last_24h),
        "age_risk": _age_risk(account_age_days),
        "device_risk": _device_risk(device_risk_score),
    }

    logit = _BIAS + sum(_WEIGHTS[name] * value for name, value in features.items())
    fraud_probability = 1.0 / (1.0 + math.exp(-logit))

    return {
        "fraud_probability": round(fraud_probability, 4),
        "features": {name: round(value, 4) for name, value in features.items()},
        "weights": _WEIGHTS,
    }


# ---------------------------------------------------------------------------
# API schema
# ---------------------------------------------------------------------------

class ScoreRequest(BaseModel):
    transaction_id: str
    amount_pkr: float = Field(gt=0)
    velocity_last_24h: int = Field(ge=0)
    account_age_days: float = Field(ge=0)
    device_risk_score: float = Field(ge=0, le=1)


class ScoreResponse(BaseModel):
    transaction_id: str
    fraud_probability: float
    features: dict
    weights: dict
    model_version: str
    latency_ms: float


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_version": "mock-xgboost-1.0.0"}


@app.post("/api/v1/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    started = time.perf_counter()
    result = score_transaction(
        amount_pkr=request.amount_pkr,
        velocity_last_24h=request.velocity_last_24h,
        account_age_days=request.account_age_days,
        device_risk_score=request.device_risk_score,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000

    return ScoreResponse(
        transaction_id=request.transaction_id,
        fraud_probability=result["fraud_probability"],
        features=result["features"],
        weights=result["weights"],
        model_version="mock-xgboost-1.0.0",
        latency_ms=round(elapsed_ms, 3),
    )
