from __future__ import annotations

from datetime import timedelta

import pandas as pd
import pytest

from fraud_ml.features import common
from fraud_ml.features.prediction import FEATURE_NAMES, build_prediction_features
from fraud_ml.features.training import build_training_dataset

from .conftest import BASE_TIME, make_transaction


class TestNoLeakage:
    def test_history_before_filters_strictly_prior(self):
        from fraud_ml.schemas import TransactionHistoryItem

        as_of = BASE_TIME
        items = [
            TransactionHistoryItem(amount=1, direction="OUTBOUND", transaction_at=BASE_TIME - timedelta(days=1)),
            TransactionHistoryItem(amount=2, direction="OUTBOUND", transaction_at=BASE_TIME),  # same instant: excluded
            TransactionHistoryItem(amount=3, direction="OUTBOUND", transaction_at=BASE_TIME + timedelta(days=1)),  # future: excluded
        ]
        result = common.history_before(items, as_of)
        assert [t.amount for t in result] == [1]

    def test_build_feature_dict_ignores_future_history_entries(self, customer):
        from fraud_ml.schemas import TransactionHistoryItem

        txn = make_transaction(amount=100.0, transaction_at=BASE_TIME)
        future_item = TransactionHistoryItem(
            amount=999999.0, direction="OUTBOUND", transaction_at=BASE_TIME + timedelta(days=1)
        )
        features_with_future_junk = common.build_feature_dict(txn, customer, [future_item])
        features_without = common.build_feature_dict(txn, customer, [])
        assert features_with_future_junk == features_without


class TestTrainingPredictionParity:
    """The single most important property of this feature layer: training
    (DuckDB, bulk) and prediction (Python, single-row) must compute
    identical numbers for identical inputs, or a model would be scored on
    features that don't match what it was trained on."""

    def test_training_and_prediction_features_agree(self):
        transactions = pd.DataFrame(
            [
                {
                    "transaction_id": "t1",
                    "customer_id": "c1",
                    "amount": 100.0,
                    "counterparty_account": "a1",
                    "destination_country": "US",
                    "counterparty_country": "US",
                    "device_id": "d1",
                    "device_is_new": False,
                    "transaction_at": BASE_TIME,
                    "is_fraud": 0,
                },
                {
                    "transaction_id": "t2",
                    "customer_id": "c1",
                    "amount": 9500.0,
                    "counterparty_account": "a2",
                    "destination_country": "NG",
                    "counterparty_country": "NG",
                    "device_id": "d2",
                    "device_is_new": True,
                    "transaction_at": BASE_TIME + timedelta(days=1),
                    "is_fraud": 1,
                },
                {
                    "transaction_id": "t3",
                    "customer_id": "c1",
                    "amount": 120.0,
                    "counterparty_account": "a1",
                    "destination_country": "US",
                    "counterparty_country": "US",
                    "device_id": "d1",
                    "device_is_new": False,
                    "transaction_at": BASE_TIME + timedelta(days=2),
                    "is_fraud": 0,
                },
            ]
        )
        customers = pd.DataFrame(
            [{"customer_id": "c1", "average_transaction_amount": 110.0, "account_opened_at": BASE_TIME - timedelta(days=400)}]
        )

        X, y = build_training_dataset(transactions, customers)

        from fraud_ml.schemas import CustomerContext, TransactionContext, TransactionHistoryItem

        customer_ctx = CustomerContext(
            id="c1", average_transaction_amount=110.0, account_opened_at=BASE_TIME - timedelta(days=400)
        )
        history = [
            TransactionHistoryItem(
                amount=100.0, direction="OUTBOUND", counterparty_account="a1", counterparty_country="US",
                destination_country="US", device_id="d1", transaction_at=BASE_TIME,
            ),
            TransactionHistoryItem(
                amount=9500.0, direction="OUTBOUND", counterparty_account="a2", counterparty_country="NG",
                destination_country="NG", device_id="d2", transaction_at=BASE_TIME + timedelta(days=1),
            ),
        ]
        t3 = TransactionContext(
            customer_id="c1", direction="OUTBOUND", amount=120.0, channel="WIRE", counterparty_account="a1",
            counterparty_country="US", destination_country="US", device_id="d1", device_is_new=False,
            transaction_at=BASE_TIME + timedelta(days=2),
        )
        prediction_features = build_prediction_features(t3, customer_ctx, history)

        training_row = X.loc["t3"].to_dict()
        for name in FEATURE_NAMES:
            assert training_row[name] == pytest.approx(prediction_features[name]), name

    def test_training_dataset_raises_on_missing_columns(self):
        with pytest.raises(ValueError):
            build_training_dataset(pd.DataFrame({"transaction_id": ["t1"]}), pd.DataFrame({"customer_id": ["c1"]}))
