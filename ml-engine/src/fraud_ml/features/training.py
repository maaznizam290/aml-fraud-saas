"""Bulk, point-in-time-correct feature construction for training, built with
DuckDB SQL rather than a Python loop over rows.

Every aggregate below is computed with `p.transaction_at < t.transaction_at`
(strictly before the row being featurized) — this is the one rule that
prevents data leakage in a dataset like this, and putting it in one place in
SQL makes it easy to audit compared to scattering `.shift()`/`.expanding()`
calls across pandas code. `tests/test_features.py` cross-checks a handful of
rows against `features.prediction.build_prediction_features` to prove the
two paths agree on what each feature name means.

This does not scale indefinitely (each row triggers several correlated
subqueries), but is more than adequate for the demo/MVP data volumes this
project targets (see docs/ML_ENGINE.md limitations) — DuckDB's vectorized
execution keeps this fast into the tens of thousands of rows.
"""
from __future__ import annotations

import duckdb
import pandas as pd

from fraud_ml.features.prediction import FEATURE_NAMES

_FEATURE_SQL = """
with base as (
    select
        t.transaction_id,
        t.customer_id,
        t.amount,
        t.counterparty_account,
        coalesce(t.destination_country, t.counterparty_country) as country,
        t.device_id,
        t.device_is_new,
        t.transaction_at,
        c.average_transaction_amount,
        c.account_opened_at
    from transactions t
    join customers c on c.customer_id = t.customer_id
)
select
    b.transaction_id,
    b.amount as amount,
    case
        when b.average_transaction_amount is null or b.average_transaction_amount <= 0 then 1.0
        else b.amount / b.average_transaction_amount
    end as amount_deviation_from_profile,
    case
        when hist.history_size < 3 then 0.0
        when hist.prior_std_amount = 0 then 0.0
        else (b.amount - hist.prior_mean_amount) / hist.prior_std_amount
    end as amount_zscore_vs_history,
    hist.velocity_2h as velocity_2h,
    hist.frequency_24h as frequency_24h,
    hist.unique_beneficiaries as unique_beneficiaries,
    case when hist.beneficiary_prior_count = 0 then 1.0 else 0.0 end as is_new_beneficiary,
    case when b.device_is_new or hist.device_prior_count = 0 then 1.0 else 0.0 end as is_new_device,
    case when hist.country_prior_count = 0 then 1.0 else 0.0 end as is_new_country,
    hist.country_fanout_7d as country_fanout_7d,
    date_diff('second', b.account_opened_at, b.transaction_at) / 86400.0 as account_age_days,
    hist.structuring_prior_count
        + case when b.amount >= 9000 and b.amount < 10000 then 1 else 0 end as structuring_occurrences_10d,
    hist.history_size as history_size
from base b
cross join lateral (
    select
        count(*) filter (
            where p.transaction_at < b.transaction_at
        ) as history_size,
        avg(p.amount) filter (where p.transaction_at < b.transaction_at) as prior_mean_amount,
        stddev_pop(p.amount) filter (where p.transaction_at < b.transaction_at) as prior_std_amount,
        count(*) filter (
            where p.transaction_at < b.transaction_at
              and p.transaction_at >= b.transaction_at - interval 2 hour
        ) as velocity_2h,
        count(*) filter (
            where p.transaction_at < b.transaction_at
              and p.transaction_at >= b.transaction_at - interval 1 day
        ) as frequency_24h,
        count(distinct p.counterparty_account) filter (
            where p.transaction_at < b.transaction_at
        ) as unique_beneficiaries,
        count(*) filter (
            where p.transaction_at < b.transaction_at and p.counterparty_account = b.counterparty_account
        ) as beneficiary_prior_count,
        count(*) filter (
            where p.transaction_at < b.transaction_at and p.device_id = b.device_id
        ) as device_prior_count,
        count(*) filter (
            where p.transaction_at < b.transaction_at
              and p.country = b.country
        ) as country_prior_count,
        count(distinct p.country) filter (
            where p.transaction_at < b.transaction_at
              and p.transaction_at >= b.transaction_at - interval 7 day
        ) as country_fanout_7d,
        count(*) filter (
            where p.transaction_at < b.transaction_at
              and p.transaction_at >= b.transaction_at - interval 10 day
              and p.amount >= 9000 and p.amount < 10000
        ) as structuring_prior_count
    from base p
    where p.customer_id = b.customer_id
) hist
order by b.transaction_id
"""


def build_training_dataset(
    transactions: pd.DataFrame, customers: pd.DataFrame, label_col: str = "is_fraud"
) -> tuple[pd.DataFrame, pd.Series]:
    """`transactions` must have: transaction_id, customer_id, amount,
    counterparty_account, destination_country, counterparty_country,
    device_id, device_is_new, transaction_at, and `label_col`.
    `customers` must have: customer_id, average_transaction_amount,
    account_opened_at.

    Returns (X, y) with X columns exactly matching
    features.prediction.FEATURE_NAMES, indexed to align with `y`.
    """
    required_txn_cols = {
        "transaction_id",
        "customer_id",
        "amount",
        "counterparty_account",
        "destination_country",
        "counterparty_country",
        "device_id",
        "device_is_new",
        "transaction_at",
        label_col,
    }
    missing = required_txn_cols - set(transactions.columns)
    if missing:
        raise ValueError(f"transactions is missing required columns: {sorted(missing)}")

    con = duckdb.connect(database=":memory:")
    con.register("transactions", transactions)
    con.register("customers", customers)
    features_df = con.execute(_FEATURE_SQL).df()
    con.close()

    features_df = features_df.set_index("transaction_id").loc[:, list(FEATURE_NAMES)]
    labels = transactions.set_index("transaction_id")[label_col].loc[features_df.index]

    return features_df, labels
