"""Shared contracts for the ML engine.

Enum values here are kept in lockstep with the Supabase schema from
feature/supabase-schema (supabase/migrations/20250101000002_enums.sql and
lib/supabase/types.ts) rather than inventing a competing vocabulary — in
particular RiskSignalType matches risk_signal_type exactly, and Disposition
matches recommendation_disposition exactly (ESCALATE | CLEAR | REFER — no
autonomous-adverse-action value exists anywhere in this schema).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RiskSignalType(str, Enum):
    AMOUNT_ANOMALY = "AMOUNT_ANOMALY"
    VELOCITY_ANOMALY = "VELOCITY_ANOMALY"
    NEW_BENEFICIARY = "NEW_BENEFICIARY"
    NEW_DEVICE = "NEW_DEVICE"
    LOCATION_ANOMALY = "LOCATION_ANOMALY"
    COUNTRY_RISK = "COUNTRY_RISK"
    CUSTOMER_RISK = "CUSTOMER_RISK"
    KYC_STATUS = "KYC_STATUS"
    SANCTIONS_RESULT = "SANCTIONS_RESULT"
    HISTORICAL_BEHAVIOR = "HISTORICAL_BEHAVIOR"
    ACCOUNT_AGE = "ACCOUNT_AGE"
    TRANSACTION_FREQUENCY = "TRANSACTION_FREQUENCY"
    STRUCTURING_INDICATOR = "STRUCTURING_INDICATOR"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Disposition(str, Enum):
    """Mirrors recommendation_disposition. Recommendation only — a human
    analyst decision (analyst_decisions in the DB schema) is what actually
    authorizes any downstream action."""

    ESCALATE = "ESCALATE"
    CLEAR = "CLEAR"
    REFER = "REFER"


class KycStatus(str, Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class SanctionsStatus(str, Enum):
    CLEAR = "CLEAR"
    POTENTIAL_MATCH = "POTENTIAL_MATCH"
    CONFIRMED_MATCH = "CONFIRMED_MATCH"
    PENDING_REVIEW = "PENDING_REVIEW"


# ---------------------------------------------------------------------------
# Inbound context
# ---------------------------------------------------------------------------


class TransactionContext(BaseModel):
    id: str | None = None
    customer_id: str
    direction: str = Field(pattern="^(INBOUND|OUTBOUND)$")
    amount: float = Field(ge=0)
    currency: str = "USD"
    channel: str
    counterparty_name: str | None = None
    counterparty_account: str | None = None
    counterparty_country: str | None = None
    origin_country: str | None = None
    destination_country: str | None = None
    device_id: str | None = None
    device_is_new: bool = False
    transaction_at: datetime


class TransactionHistoryItem(BaseModel):
    """A prior transaction for the same customer. Deliberately a narrower
    shape than TransactionContext — only what feature engineering needs, and
    it must be safely queryable as "everything strictly before the
    transaction being scored" to avoid leaking future information."""

    amount: float = Field(ge=0)
    direction: str = Field(pattern="^(INBOUND|OUTBOUND)$")
    counterparty_account: str | None = None
    counterparty_country: str | None = None
    destination_country: str | None = None
    device_id: str | None = None
    transaction_at: datetime


class CustomerContext(BaseModel):
    id: str
    risk_rating: RiskLevel = RiskLevel.LOW
    kyc_status: KycStatus = KycStatus.PENDING
    sanctions_status: SanctionsStatus = SanctionsStatus.CLEAR
    account_opened_at: datetime
    average_transaction_amount: float | None = None
    expected_monthly_volume: float | None = None
    typical_countries: list[str] = Field(default_factory=list)
    pep_status: bool = False


class PredictRequest(BaseModel):
    transaction: TransactionContext
    customer: CustomerContext
    # Prior transactions only, strictly before `transaction.transaction_at`.
    # The API does not trust a caller-supplied "current" transaction inside
    # this list — see api/app.py for the guard.
    recent_transactions: list[TransactionHistoryItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Outbound results
# ---------------------------------------------------------------------------


class RiskSignalResult(BaseModel):
    """One deterministic signal's outcome. Deliberately explainable: every
    field here is meant to be shown to a human analyst as-is."""

    signal_type: RiskSignalType
    triggered: bool
    weight: float = Field(ge=0, le=1)
    explanation: str
    context: dict[str, Any] = Field(default_factory=dict)


class FeatureSummary(BaseModel):
    """The prediction-time feature vector actually fed to the ML models,
    surfaced for explainability/debugging — not a hidden black box."""

    features: dict[str, float]


class AnomalyResult(BaseModel):
    model_name: str
    algorithm: str
    anomaly_score: float
    is_anomaly: bool
    note: str = (
        "Experimental unsupervised signal — not a regulatory-grade AML "
        "determination on its own."
    )


class SupervisedResult(BaseModel):
    model_name: str
    algorithm: str
    score: float = Field(ge=0, le=1)
    model_version: str
    provider: str


class MLPredictionResult(BaseModel):
    """Shaped to map directly onto the ml_predictions table from
    feature/supabase-schema (provider, model_name, prediction, score,
    confidence, features, metadata)."""

    provider: str
    model_name: str
    model_version: str
    prediction: str
    score: float = Field(ge=0, le=1)
    confidence: float | None = Field(default=None, ge=0, le=1)
    features: dict[str, float] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RiskAssessment(BaseModel):
    """The final, fused, explainable output. Always a recommendation — see
    Disposition. Never implies an autonomous adverse action."""

    disposition: Disposition
    risk_level: RiskLevel
    confidence: float = Field(ge=0, le=1)
    rationale: str
    contributing_signals: list[RiskSignalType]
    ml_contributed: bool


class PredictResponse(BaseModel):
    status: str = Field(pattern="^(ok|degraded)$")
    risk_signals: list[RiskSignalResult]
    feature_summary: FeatureSummary
    anomaly_results: list[AnomalyResult]
    supervised_results: list[SupervisedResult]
    ml_prediction: MLPredictionResult | None
    risk_assessment: RiskAssessment
    errors: list[str] = Field(default_factory=list)
