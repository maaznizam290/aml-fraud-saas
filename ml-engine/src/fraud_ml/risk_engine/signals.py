"""The 13 deterministic risk signals. Each function takes the same
(transaction, customer, history) triple and returns a RiskSignalResult that
is meant to be shown to an analyst verbatim: no signal here is a black box —
`explanation` always says in plain language why it did or didn't trigger,
and `context` carries the raw numbers behind that explanation.

Thresholds are intentionally simple, named module-level constants (not
buried magic numbers) so they're easy to tune per the docs' guidance, and
easy to assert against in tests.
"""
from __future__ import annotations

from fraud_ml.features import common
from fraud_ml.schemas import (
    CustomerContext,
    KycStatus,
    RiskLevel,
    RiskSignalResult,
    RiskSignalType,
    SanctionsStatus,
    TransactionContext,
    TransactionHistoryItem,
)

AMOUNT_ZSCORE_THRESHOLD = 3.0
AMOUNT_PROFILE_RATIO_THRESHOLD = 5.0
LOCATION_FANOUT_THRESHOLD = 3
FREQUENCY_THRESHOLD = 6


def _history(transaction: TransactionContext, history: list[TransactionHistoryItem]) -> list[TransactionHistoryItem]:
    return common.history_before(history, transaction.transaction_at)


def amount_anomaly_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    zscore = common.amount_deviation_zscore(transaction.amount, hist)
    profile_ratio = common.amount_deviation_from_profile(transaction.amount, customer.average_transaction_amount)

    triggered = (zscore is not None and abs(zscore) >= AMOUNT_ZSCORE_THRESHOLD) or (
        profile_ratio is not None and profile_ratio >= AMOUNT_PROFILE_RATIO_THRESHOLD
    )
    basis = []
    if zscore is not None:
        basis.append(f"{zscore:.1f} standard deviations from this customer's own transaction history")
    if profile_ratio is not None:
        basis.append(f"{profile_ratio:.1f}x their declared average transaction amount")
    explanation = (
        f"Amount ${transaction.amount:,.2f} is " + " and ".join(basis) + "."
        if basis
        else "Not enough history or profile data to assess amount anomaly."
    )
    weight = 0.0
    if triggered:
        zscore_weight = abs(zscore or 0) / (AMOUNT_ZSCORE_THRESHOLD * 2)
        profile_weight = (profile_ratio or 0) / (AMOUNT_PROFILE_RATIO_THRESHOLD * 2)
        weight = min(1.0, max(zscore_weight, profile_weight))
    return RiskSignalResult(
        signal_type=RiskSignalType.AMOUNT_ANOMALY,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"zscore_vs_history": zscore, "ratio_vs_profile_average": profile_ratio},
    )


def velocity_anomaly_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    count = common.velocity_count(transaction.transaction_at, hist)
    triggered = count >= common.VELOCITY_THRESHOLD
    explanation = (
        f"{count + 1} transactions (including this one) within "
        f"{common.VELOCITY_WINDOW.total_seconds() / 3600:.0f} hours, "
        f"{'at or above' if triggered else 'below'} the {common.VELOCITY_THRESHOLD}-transaction threshold."
    )
    weight = min(1.0, count / (common.VELOCITY_THRESHOLD * 2)) if triggered else 0.0
    return RiskSignalResult(
        signal_type=RiskSignalType.VELOCITY_ANOMALY,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"prior_transactions_in_window": count, "window_hours": common.VELOCITY_WINDOW.total_seconds() / 3600},
    )


def new_beneficiary_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    triggered = common.is_new_beneficiary(transaction.counterparty_account, hist)
    explanation = (
        f"Counterparty account {transaction.counterparty_account!r} has not been used by this customer before."
        if triggered
        else "Counterparty account has prior transaction history with this customer, or none was provided."
    )
    return RiskSignalResult(
        signal_type=RiskSignalType.NEW_BENEFICIARY,
        triggered=triggered,
        weight=0.35 if triggered else 0.0,
        explanation=explanation,
        context={"counterparty_account": transaction.counterparty_account},
    )


def new_device_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    triggered = transaction.device_is_new or common.is_new_device(transaction.device_id, hist)
    explanation = (
        "Transaction initiated from a device never seen on this account before."
        if triggered
        else "Device has prior history on this account, or none was provided."
    )
    return RiskSignalResult(
        signal_type=RiskSignalType.NEW_DEVICE,
        triggered=triggered,
        weight=0.5 if triggered else 0.0,
        explanation=explanation,
        context={"device_id": transaction.device_id},
    )


def location_anomaly_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    country = transaction.destination_country or transaction.counterparty_country
    new_country = common.is_new_country(country, hist)
    fanout = common.distinct_country_fanout(transaction.transaction_at, hist)
    triggered = new_country and fanout >= LOCATION_FANOUT_THRESHOLD
    explanation = (
        f"Destination country {country!r} is new for this customer, and {fanout} distinct countries "
        f"have been used in the past 7 days (>= {LOCATION_FANOUT_THRESHOLD})."
        if triggered
        else f"No unusual geographic fan-out detected (new_country={new_country}, 7d_fanout={fanout})."
    )
    weight = min(1.0, fanout / (LOCATION_FANOUT_THRESHOLD * 2)) if triggered else 0.0
    return RiskSignalResult(
        signal_type=RiskSignalType.LOCATION_ANOMALY,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"country": country, "is_new_country": new_country, "distinct_countries_7d": fanout},
    )


def country_risk_signal(
    transaction: TransactionContext,
    customer: CustomerContext,
    history: list[TransactionHistoryItem],
    high_risk_countries: frozenset[str] = common.DEFAULT_HIGH_RISK_COUNTRIES,
) -> RiskSignalResult:
    countries = {
        c
        for c in (transaction.origin_country, transaction.destination_country, transaction.counterparty_country)
        if c
    }
    hit = countries & high_risk_countries
    triggered = bool(hit)
    explanation = (
        f"Transaction touches elevated-risk jurisdiction(s): {', '.join(sorted(hit))}."
        if triggered
        else "No transaction country matches the configured elevated-risk jurisdiction list."
    )
    return RiskSignalResult(
        signal_type=RiskSignalType.COUNTRY_RISK,
        triggered=triggered,
        weight=0.6 if triggered else 0.0,
        explanation=explanation,
        context={"countries_involved": sorted(countries), "matched": sorted(hit)},
    )


def customer_risk_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    triggered = customer.risk_rating in (RiskLevel.HIGH, RiskLevel.CRITICAL)
    explanation = f"Customer risk rating is {customer.risk_rating.value}."
    weight = {"LOW": 0.0, "MEDIUM": 0.0, "HIGH": 0.4, "CRITICAL": 0.7}[customer.risk_rating.value]
    return RiskSignalResult(
        signal_type=RiskSignalType.CUSTOMER_RISK,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"risk_rating": customer.risk_rating.value, "pep_status": customer.pep_status},
    )


def kyc_status_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    triggered = customer.kyc_status in (KycStatus.PENDING, KycStatus.REJECTED, KycStatus.EXPIRED)
    explanation = f"Customer KYC status is {customer.kyc_status.value}."
    weight = {"VERIFIED": 0.0, "PENDING": 0.3, "EXPIRED": 0.4, "REJECTED": 0.8}[customer.kyc_status.value]
    return RiskSignalResult(
        signal_type=RiskSignalType.KYC_STATUS,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"kyc_status": customer.kyc_status.value},
    )


def sanctions_result_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    triggered = customer.sanctions_status != SanctionsStatus.CLEAR
    explanation = f"Sanctions screening status is {customer.sanctions_status.value}."
    weight = {
        "CLEAR": 0.0,
        "PENDING_REVIEW": 0.3,
        "POTENTIAL_MATCH": 0.7,
        "CONFIRMED_MATCH": 1.0,
    }[customer.sanctions_status.value]
    return RiskSignalResult(
        signal_type=RiskSignalType.SANCTIONS_RESULT,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"sanctions_status": customer.sanctions_status.value},
    )


def historical_behavior_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    zscore = common.amount_deviation_zscore(transaction.amount, hist)
    country = transaction.destination_country or transaction.counterparty_country
    has_typical_countries = bool(customer.typical_countries)
    off_pattern_country = bool(country) and has_typical_countries and country not in customer.typical_countries
    triggered = (zscore is not None and abs(zscore) >= AMOUNT_ZSCORE_THRESHOLD) or off_pattern_country
    explanation = (
        "Transaction deviates from this customer's established behavioral pattern "
        f"(history z-score={zscore}, country outside typical list={off_pattern_country})."
        if triggered
        else "Consistent with this customer's established transaction history."
    )
    weight = 0.5 if triggered else 0.0
    return RiskSignalResult(
        signal_type=RiskSignalType.HISTORICAL_BEHAVIOR,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"zscore_vs_history": zscore, "off_pattern_country": off_pattern_country},
    )


def account_age_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    age_days = common.account_age_days(customer.account_opened_at, transaction.transaction_at)
    is_new_account = age_days < common.NEW_ACCOUNT_WINDOW.days
    profile_avg = customer.average_transaction_amount
    large_for_new_account = is_new_account and (profile_avg is None or transaction.amount > 3 * (profile_avg or 0))
    triggered = is_new_account and large_for_new_account
    explanation = (
        f"Account is only {age_days:.0f} days old and this transaction is unusually large for a new account."
        if triggered
        else f"Account age is {age_days:.0f} days; no new-account risk pattern detected."
    )
    return RiskSignalResult(
        signal_type=RiskSignalType.ACCOUNT_AGE,
        triggered=triggered,
        weight=0.45 if triggered else 0.0,
        explanation=explanation,
        context={"account_age_days": age_days},
    )


def transaction_frequency_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    count = common.frequency_count(transaction.transaction_at, hist)
    triggered = count >= FREQUENCY_THRESHOLD
    explanation = (
        f"{count + 1} transactions (including this one) in the past 24 hours, "
        f"{'at or above' if triggered else 'below'} the {FREQUENCY_THRESHOLD}-transaction threshold."
    )
    weight = min(1.0, count / (FREQUENCY_THRESHOLD * 2)) if triggered else 0.0
    return RiskSignalResult(
        signal_type=RiskSignalType.TRANSACTION_FREQUENCY,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"transactions_24h": count + 1},
    )


def structuring_indicator_signal(
    transaction: TransactionContext, customer: CustomerContext, history: list[TransactionHistoryItem]
) -> RiskSignalResult:
    hist = _history(transaction, history)
    occurrences = common.structuring_occurrences(transaction.amount, transaction.transaction_at, hist)
    triggered = occurrences >= common.STRUCTURING_MIN_OCCURRENCES
    explanation = (
        f"{occurrences} transactions within "
        f"${common.STRUCTURING_THRESHOLD - common.STRUCTURING_MARGIN:,.0f}-${common.STRUCTURING_THRESHOLD:,.0f} "
        f"in the past {common.STRUCTURING_WINDOW.days} days — a pattern consistent with structuring."
        if triggered
        else "No structuring pattern detected."
    )
    weight = min(1.0, occurrences / (common.STRUCTURING_MIN_OCCURRENCES * 2)) if triggered else 0.0
    return RiskSignalResult(
        signal_type=RiskSignalType.STRUCTURING_INDICATOR,
        triggered=triggered,
        weight=weight,
        explanation=explanation,
        context={"occurrences_in_window": occurrences},
    )


ALL_SIGNAL_FUNCTIONS = (
    amount_anomaly_signal,
    velocity_anomaly_signal,
    new_beneficiary_signal,
    new_device_signal,
    location_anomaly_signal,
    country_risk_signal,
    customer_risk_signal,
    kyc_status_signal,
    sanctions_result_signal,
    historical_behavior_signal,
    account_age_signal,
    transaction_frequency_signal,
    structuring_indicator_signal,
)
