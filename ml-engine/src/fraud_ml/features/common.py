"""Pure, dependency-light feature primitives shared by the deterministic
risk engine (fraud_ml.risk_engine.signals) and the ML feature builders
(fraud_ml.features.training / .prediction). Keeping them here means a
signal's boolean/explanation and a model's numeric feature are always
computed the same way — no drift between "what an analyst sees" and "what
the model saw".

Every function here takes only the current transaction plus *prior*
history — nothing here can see into the future, which is the main
data-leakage trap for this kind of dataset (see features/training.py for how
that's enforced at the dataset-construction level too).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean, pstdev

from fraud_ml.schemas import CustomerContext, TransactionContext, TransactionHistoryItem

# Placeholder illustrative default — a real deployment should configure this
# per-tenant from an actual sanctions/high-risk-jurisdiction policy (e.g.
# FATF's list), not hardcode it. Kept small and clearly a stand-in.
DEFAULT_HIGH_RISK_COUNTRIES: frozenset[str] = frozenset({"KY", "NG"})

STRUCTURING_THRESHOLD = 10_000.0
STRUCTURING_MARGIN = 1_000.0  # "just under" = within this margin below threshold
STRUCTURING_WINDOW = timedelta(days=10)
STRUCTURING_MIN_OCCURRENCES = 3

VELOCITY_WINDOW = timedelta(hours=2)
VELOCITY_THRESHOLD = 5  # more than this many transactions in the window is anomalous

FREQUENCY_WINDOW = timedelta(days=1)

NEW_ACCOUNT_WINDOW = timedelta(days=30)


def history_before(
    history: list[TransactionHistoryItem], as_of: datetime
) -> list[TransactionHistoryItem]:
    """Defensive filter: only transactions strictly before `as_of`. Callers
    are expected to already pass pre-filtered history, but every consumer
    goes through this so a caller mistake can't silently leak future data
    into a feature or signal."""
    return [t for t in history if t.transaction_at < as_of]


def amount_deviation_zscore(amount: float, history: list[TransactionHistoryItem]) -> float | None:
    """Standard-score of `amount` against the customer's own transaction
    history. None when there isn't enough history to compute one, or when
    the history has zero variance (a z-score is undefined there — returning
    +/-inf for any deviation would make a handful of identical past
    transactions look infinitely anomalous, which isn't meaningful)."""
    amounts = [t.amount for t in history]
    if len(amounts) < 3:
        return None
    mu = mean(amounts)
    sigma = pstdev(amounts)
    if sigma == 0:
        return None
    return (amount - mu) / sigma


def amount_deviation_from_profile(amount: float, average_transaction_amount: float | None) -> float | None:
    """Deviation ratio against the customer's *declared* profile average
    (customer_profiles.average_transaction_amount), independent of recent
    transaction history — the two can disagree (e.g. a new-ish account with
    a stated expected volume but little history yet)."""
    if not average_transaction_amount or average_transaction_amount <= 0:
        return None
    return amount / average_transaction_amount


def velocity_count(as_of: datetime, history: list[TransactionHistoryItem], window: timedelta = VELOCITY_WINDOW) -> int:
    window_start = as_of - window
    return sum(1 for t in history_before(history, as_of) if t.transaction_at >= window_start)


def frequency_count(
    as_of: datetime, history: list[TransactionHistoryItem], window: timedelta = FREQUENCY_WINDOW
) -> int:
    return velocity_count(as_of, history, window)


def is_new_beneficiary(counterparty_account: str | None, history: list[TransactionHistoryItem]) -> bool:
    if not counterparty_account:
        return False
    seen = {t.counterparty_account for t in history if t.counterparty_account}
    return counterparty_account not in seen


def is_new_device(device_id: str | None, history: list[TransactionHistoryItem]) -> bool:
    if not device_id:
        return False
    seen = {t.device_id for t in history if t.device_id}
    return device_id not in seen


def is_new_country(country: str | None, history: list[TransactionHistoryItem]) -> bool:
    if not country:
        return False
    seen = {t.destination_country for t in history if t.destination_country} | {
        t.counterparty_country for t in history if t.counterparty_country
    }
    return country not in seen


def distinct_country_fanout(
    as_of: datetime, history: list[TransactionHistoryItem], window: timedelta = timedelta(days=7)
) -> int:
    window_start = as_of - window
    countries = {
        t.destination_country or t.counterparty_country
        for t in history_before(history, as_of)
        if t.transaction_at >= window_start and (t.destination_country or t.counterparty_country)
    }
    return len(countries)


def account_age_days(account_opened_at: datetime, as_of: datetime) -> float:
    return max((as_of - account_opened_at).total_seconds() / 86400.0, 0.0)


def structuring_occurrences(
    amount: float,
    as_of: datetime,
    history: list[TransactionHistoryItem],
    threshold: float = STRUCTURING_THRESHOLD,
    margin: float = STRUCTURING_MARGIN,
    window: timedelta = STRUCTURING_WINDOW,
) -> int:
    """Count of transactions (including the current one) within `window`
    whose amount sits in [threshold - margin, threshold)."""
    window_start = as_of - window

    def _in_band(v: float) -> bool:
        return (threshold - margin) <= v < threshold

    count = sum(
        1
        for t in history_before(history, as_of)
        if t.transaction_at >= window_start and _in_band(t.amount)
    )
    if _in_band(amount):
        count += 1
    return count


def unique_beneficiaries(history: list[TransactionHistoryItem]) -> int:
    return len({t.counterparty_account for t in history if t.counterparty_account})


def build_feature_dict(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> dict[str, float]:
    """The canonical numeric feature vector for a single (transaction,
    customer, history) triple. Used identically at training time (one row
    per historical transaction, built from that transaction's own
    point-in-time history) and at prediction time — see
    features/training.py and features/prediction.py."""
    as_of = transaction.transaction_at
    hist = history_before(history, as_of)

    profile_deviation = amount_deviation_from_profile(transaction.amount, customer.average_transaction_amount)
    history_zscore = amount_deviation_zscore(transaction.amount, hist)

    return {
        "amount": float(transaction.amount),
        "amount_deviation_from_profile": profile_deviation if profile_deviation is not None else 1.0,
        "amount_zscore_vs_history": history_zscore if history_zscore is not None else 0.0,
        "velocity_2h": float(velocity_count(as_of, hist)),
        "frequency_24h": float(frequency_count(as_of, hist)),
        "unique_beneficiaries": float(unique_beneficiaries(hist)),
        "is_new_beneficiary": float(is_new_beneficiary(transaction.counterparty_account, hist)),
        "is_new_device": float(transaction.device_is_new or is_new_device(transaction.device_id, hist)),
        "is_new_country": float(is_new_country(transaction.destination_country, hist)),
        "country_fanout_7d": float(distinct_country_fanout(as_of, hist)),
        "account_age_days": account_age_days(customer.account_opened_at, as_of),
        "structuring_occurrences_10d": float(structuring_occurrences(transaction.amount, as_of, hist)),
        "history_size": float(len(hist)),
    }
