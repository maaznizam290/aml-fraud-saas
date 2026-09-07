from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from fraud_ml.schemas import CustomerContext, TransactionContext, TransactionHistoryItem

BASE_TIME = datetime(2024, 1, 1, 12, 0, 0)


@pytest.fixture
def base_time() -> datetime:
    return BASE_TIME


def make_customer(**overrides) -> CustomerContext:
    defaults = dict(
        id="cust_1",
        risk_rating="LOW",
        kyc_status="VERIFIED",
        sanctions_status="CLEAR",
        account_opened_at=BASE_TIME - timedelta(days=500),
        average_transaction_amount=200.0,
        expected_monthly_volume=4000.0,
        typical_countries=["US"],
        pep_status=False,
    )
    defaults.update(overrides)
    return CustomerContext(**defaults)


def make_transaction(**overrides) -> TransactionContext:
    defaults = dict(
        customer_id="cust_1",
        direction="OUTBOUND",
        amount=200.0,
        currency="USD",
        channel="ACH",
        counterparty_account="acct_known",
        counterparty_country="US",
        origin_country="US",
        destination_country="US",
        device_id="device_known",
        device_is_new=False,
        transaction_at=BASE_TIME,
    )
    defaults.update(overrides)
    return TransactionContext(**defaults)


def make_history_item(**overrides) -> TransactionHistoryItem:
    defaults = dict(
        amount=200.0,
        direction="OUTBOUND",
        counterparty_account="acct_known",
        counterparty_country="US",
        destination_country="US",
        device_id="device_known",
        transaction_at=BASE_TIME - timedelta(days=10),
    )
    defaults.update(overrides)
    return TransactionHistoryItem(**defaults)


def make_regular_history(n: int = 10, amount: float = 200.0, days_apart: float = 5.0) -> list[TransactionHistoryItem]:
    return [
        make_history_item(
            amount=amount,
            transaction_at=BASE_TIME - timedelta(days=days_apart * (n - i)),
        )
        for i in range(n)
    ]


@pytest.fixture
def customer() -> CustomerContext:
    return make_customer()


@pytest.fixture
def regular_history() -> list[TransactionHistoryItem]:
    return make_regular_history()
