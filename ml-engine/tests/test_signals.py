from __future__ import annotations

from datetime import timedelta

from fraud_ml.risk_engine.engine import DeterministicRiskEngine
from fraud_ml.risk_engine.signals import (
    account_age_signal,
    amount_anomaly_signal,
    country_risk_signal,
    customer_risk_signal,
    kyc_status_signal,
    location_anomaly_signal,
    new_beneficiary_signal,
    new_device_signal,
    sanctions_result_signal,
    structuring_indicator_signal,
    transaction_frequency_signal,
    velocity_anomaly_signal,
)
from fraud_ml.schemas import RiskSignalType

from .conftest import BASE_TIME, make_customer, make_history_item, make_transaction


class TestNormalTransaction:
    """Required edge case: normal transaction should trigger nothing."""

    def test_no_signals_trigger(self, customer, regular_history):
        txn = make_transaction(amount=210.0, transaction_at=BASE_TIME)
        engine = DeterministicRiskEngine()
        signals = engine.evaluate(txn, customer, regular_history)
        triggered = [s for s in signals if s.triggered]
        assert triggered == []
        assert DeterministicRiskEngine.aggregate_score(signals) == 0.0

    def test_all_13_signal_types_present(self, customer, regular_history):
        txn = make_transaction()
        engine = DeterministicRiskEngine()
        signals = engine.evaluate(txn, customer, regular_history)
        assert {s.signal_type for s in signals} == set(RiskSignalType)


class TestHighVelocity:
    """Required edge case: high velocity."""

    def test_velocity_triggers_above_threshold(self, customer):
        history = [
            make_history_item(transaction_at=BASE_TIME - timedelta(minutes=10 * i)) for i in range(1, 7)
        ]
        txn = make_transaction(transaction_at=BASE_TIME)
        result = velocity_anomaly_signal(txn, customer, history)
        assert result.triggered is True
        assert result.weight > 0

    def test_velocity_does_not_trigger_for_sparse_history(self, customer, regular_history):
        txn = make_transaction(transaction_at=BASE_TIME)
        result = velocity_anomaly_signal(txn, customer, regular_history)
        assert result.triggered is False


class TestUnusuallyLargeTransaction:
    """Required edge case: unusually large transaction."""

    def test_amount_anomaly_triggers_on_large_deviation_from_profile(self, customer, regular_history):
        txn = make_transaction(amount=5000.0)  # profile average is 200
        result = amount_anomaly_signal(txn, customer, regular_history)
        assert result.triggered is True
        assert result.context["ratio_vs_profile_average"] == 25.0

    def test_amount_anomaly_does_not_trigger_for_typical_amount(self, customer, regular_history):
        txn = make_transaction(amount=220.0)
        result = amount_anomaly_signal(txn, customer, regular_history)
        assert result.triggered is False


class TestNewDevice:
    """Required edge case: new device."""

    def test_new_device_flag_triggers(self, customer, regular_history):
        txn = make_transaction(device_id="brand_new", device_is_new=True)
        result = new_device_signal(txn, customer, regular_history)
        assert result.triggered is True

    def test_unseen_device_id_triggers_even_without_flag(self, customer, regular_history):
        txn = make_transaction(device_id="never_seen_before", device_is_new=False)
        result = new_device_signal(txn, customer, regular_history)
        assert result.triggered is True

    def test_known_device_does_not_trigger(self, customer, regular_history):
        txn = make_transaction(device_id="device_known", device_is_new=False)
        result = new_device_signal(txn, customer, regular_history)
        assert result.triggered is False


class TestGeographicAnomaly:
    """Required edge case: geographic anomaly."""

    def test_location_anomaly_triggers_on_new_country_plus_fanout(self, customer):
        history = [
            make_history_item(destination_country="US", counterparty_country="US", transaction_at=BASE_TIME - timedelta(days=1)),
            make_history_item(destination_country="GB", counterparty_country="GB", transaction_at=BASE_TIME - timedelta(days=2)),
            make_history_item(destination_country="DE", counterparty_country="DE", transaction_at=BASE_TIME - timedelta(days=3)),
        ]
        txn = make_transaction(destination_country="SG", counterparty_country="SG")
        result = location_anomaly_signal(txn, customer, history)
        assert result.triggered is True

    def test_no_fanout_does_not_trigger(self, customer, regular_history):
        txn = make_transaction(destination_country="US")
        result = location_anomaly_signal(txn, customer, regular_history)
        assert result.triggered is False

    def test_country_risk_signal_flags_high_risk_jurisdiction(self, customer, regular_history):
        txn = make_transaction(destination_country="NG", counterparty_country="NG")
        result = country_risk_signal(txn, customer, regular_history)
        assert result.triggered is True
        assert "NG" in result.context["matched"]


class TestStructuring:
    """Required edge case: structuring."""

    def test_structuring_triggers_on_repeated_near_threshold_amounts(self, customer):
        history = [
            make_history_item(amount=9500.0, transaction_at=BASE_TIME - timedelta(days=3)),
            make_history_item(amount=9700.0, transaction_at=BASE_TIME - timedelta(days=6)),
        ]
        txn = make_transaction(amount=9650.0, transaction_at=BASE_TIME)
        result = structuring_indicator_signal(txn, customer, history)
        assert result.triggered is True
        assert result.context["occurrences_in_window"] == 3

    def test_structuring_does_not_trigger_for_single_near_threshold_transaction(self, customer, regular_history):
        txn = make_transaction(amount=9500.0, transaction_at=BASE_TIME)
        result = structuring_indicator_signal(txn, customer, regular_history)
        assert result.triggered is False


class TestFalsePositive:
    """Required edge case: a legitimate but unusual transaction should still
    surface as a low-confidence, reviewable signal rather than something the
    system silently "decides" is fraud — i.e. it triggers a signal, but the
    engine and fusion layer never turn that alone into more than a
    recommendation (see test_fusion.py for the disposition-level check)."""

    def test_large_but_explainable_payment_triggers_amount_signal_only(self, customer, regular_history):
        # A legitimate annual bonus deposit: large relative to history, but
        # otherwise normal (known device, known country, no velocity/structuring).
        txn = make_transaction(amount=6000.0, direction="INBOUND")
        engine = DeterministicRiskEngine()
        signals = engine.evaluate(txn, customer, regular_history)
        triggered_types = {s.signal_type for s in signals if s.triggered}
        assert RiskSignalType.AMOUNT_ANOMALY in triggered_types
        # None of the more severe indicators should have fired for this case.
        assert RiskSignalType.STRUCTURING_INDICATOR not in triggered_types
        assert RiskSignalType.SANCTIONS_RESULT not in triggered_types
        assert RiskSignalType.NEW_DEVICE not in triggered_types


class TestCustomerAndComplianceSignals:
    def test_customer_risk_signal(self):
        low_risk = customer_risk_signal(make_transaction(), make_customer(risk_rating="LOW"), [])
        high_risk = customer_risk_signal(make_transaction(), make_customer(risk_rating="CRITICAL"), [])
        assert low_risk.triggered is False
        assert high_risk.triggered is True
        assert high_risk.weight > low_risk.weight

    def test_kyc_status_signal(self):
        verified = kyc_status_signal(make_transaction(), make_customer(kyc_status="VERIFIED"), [])
        rejected = kyc_status_signal(make_transaction(), make_customer(kyc_status="REJECTED"), [])
        assert verified.triggered is False
        assert rejected.triggered is True

    def test_sanctions_result_signal(self):
        clear = sanctions_result_signal(make_transaction(), make_customer(sanctions_status="CLEAR"), [])
        matched = sanctions_result_signal(make_transaction(), make_customer(sanctions_status="CONFIRMED_MATCH"), [])
        assert clear.triggered is False
        assert matched.triggered is True
        assert matched.weight == 1.0

    def test_account_age_signal_flags_new_account_with_large_transaction(self):
        new_customer = make_customer(account_opened_at=BASE_TIME - timedelta(days=5), average_transaction_amount=100.0)
        txn = make_transaction(amount=5000.0)
        result = account_age_signal(txn, new_customer, [])
        assert result.triggered is True

    def test_transaction_frequency_signal(self, customer):
        history = [make_history_item(transaction_at=BASE_TIME - timedelta(hours=i)) for i in range(1, 8)]
        txn = make_transaction(transaction_at=BASE_TIME)
        result = transaction_frequency_signal(txn, customer, history)
        assert result.triggered is True

    def test_new_beneficiary_signal(self, customer, regular_history):
        known = new_beneficiary_signal(make_transaction(counterparty_account="acct_known"), customer, regular_history)
        unknown = new_beneficiary_signal(make_transaction(counterparty_account="acct_never_seen"), customer, regular_history)
        assert known.triggered is False
        assert unknown.triggered is True
