"""Prediction-time feature building: a single (transaction, customer,
history) triple in, one feature row out. Thin wrapper around
features.common.build_feature_dict so prediction and training can never
silently drift onto different feature definitions — see training.py for how
the same names are computed in bulk from a historical dataset."""
from __future__ import annotations

from fraud_ml.features.common import build_feature_dict
from fraud_ml.schemas import CustomerContext, TransactionContext, TransactionHistoryItem


def build_prediction_features(
    transaction: TransactionContext,
    customer: CustomerContext,
    history: list[TransactionHistoryItem] | None = None,
) -> dict[str, float]:
    return build_feature_dict(transaction, customer, history or [])


FEATURE_NAMES: tuple[str, ...] = (
    "amount",
    "amount_deviation_from_profile",
    "amount_zscore_vs_history",
    "velocity_2h",
    "frequency_24h",
    "unique_beneficiaries",
    "is_new_beneficiary",
    "is_new_device",
    "is_new_country",
    "country_fanout_7d",
    "account_age_days",
    "structuring_occurrences_10d",
    "history_size",
)
