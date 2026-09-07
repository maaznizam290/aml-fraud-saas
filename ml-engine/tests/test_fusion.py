from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from fraud_ml import schemas
from fraud_ml.fusion import fuse_risk
from fraud_ml.risk_engine.engine import DeterministicRiskEngine
from fraud_ml.schemas import Disposition, MLPredictionResult, RiskLevel

from .conftest import make_customer, make_transaction

FORBIDDEN_ADVERSE_ACTION_LITERALS = ("AUTO_CLOSE", "AUTO_FILE_SAR", "AUTO_MOVE_FUNDS", "AUTO_DENY", "AUTO_RELEASE")


def test_no_enum_anywhere_in_schemas_contains_an_autonomous_adverse_action():
    """Mirrors the equivalent check in feature/supabase-schema
    (tests/migrations.test.ts) — the Critical Rule in CLAUDE.md must hold on
    both sides of the schema boundary."""
    enum_classes = [obj for obj in vars(schemas).values() if isinstance(obj, type) and issubclass(obj, Enum)]
    assert len(enum_classes) >= 5  # sanity: we actually found the real enums, not an empty list
    for enum_cls in enum_classes:
        for member in enum_cls:
            for forbidden in FORBIDDEN_ADVERSE_ACTION_LITERALS:
                assert forbidden not in member.value, f"{enum_cls.__name__}.{member.name}"


def make_ml_result(score: float) -> MLPredictionResult:
    return MLPredictionResult(
        provider="local",
        model_name="xgboost-fraud",
        model_version="1.0.0",
        prediction="FRAUD_LIKELY" if score >= 0.5 else "FRAUD_UNLIKELY",
        score=score,
        created_at=datetime.now(UTC),
    )


class TestFusionNeverDependsSolelyOnML:
    def test_works_with_no_ml_result_at_all(self, customer, regular_history):
        txn = make_transaction(amount=5000.0)  # trips amount anomaly deterministically
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=None)
        assert assessment.ml_contributed is False
        assert assessment.disposition in set(Disposition)
        assert assessment.risk_level in set(RiskLevel)

    def test_clean_transaction_with_no_ml_clears(self, customer, regular_history):
        txn = make_transaction(amount=205.0)
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=None)
        assert assessment.disposition == Disposition.CLEAR

    def test_ml_score_alone_cannot_force_escalate_past_deterministic_weight(self, customer, regular_history):
        # Clean deterministic evidence + a maximal ML score should NOT reach
        # ESCALATE, because ML is capped at 40% of the blended weight.
        txn = make_transaction(amount=205.0)
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=make_ml_result(1.0))
        assert assessment.ml_contributed is True
        assert assessment.disposition != Disposition.ESCALATE

    def test_high_deterministic_and_high_ml_escalates(self, customer, regular_history):
        txn = make_transaction(amount=50_000.0, destination_country="NG", counterparty_country="NG", device_id="new", device_is_new=True)
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=make_ml_result(0.95))
        assert assessment.disposition == Disposition.ESCALATE
        assert assessment.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL)


class TestSanctionsPolicyFloor:
    def test_confirmed_sanctions_match_always_escalates(self, regular_history):
        sanctioned_customer = make_customer(sanctions_status="CONFIRMED_MATCH")
        txn = make_transaction(amount=50.0)  # otherwise totally unremarkable
        signals = DeterministicRiskEngine().evaluate(txn, sanctioned_customer, regular_history)
        assessment = fuse_risk(signals, sanctioned_customer, ml_result=None)
        assert assessment.disposition == Disposition.ESCALATE
        assert "sanctions" in assessment.rationale.lower()


class TestRationaleIsExplainable:
    def test_rationale_mentions_ml_when_present(self, customer, regular_history):
        txn = make_transaction(amount=205.0)
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=make_ml_result(0.3))
        assert "ML model" in assessment.rationale

    def test_rationale_notes_absence_of_ml(self, customer, regular_history):
        txn = make_transaction(amount=205.0)
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=None)
        assert "deterministic evidence only" in assessment.rationale.lower()

    def test_contributing_signals_matches_triggered_signals(self, customer, regular_history):
        txn = make_transaction(amount=5000.0)
        signals = DeterministicRiskEngine().evaluate(txn, customer, regular_history)
        assessment = fuse_risk(signals, customer, ml_result=None)
        expected = {s.signal_type for s in signals if s.triggered}
        assert set(assessment.contributing_signals) == expected
