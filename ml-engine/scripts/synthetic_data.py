"""Synthetic transaction data generator, used only for local training/demo
runs (scripts/train_baselines.py) and tests. Not a claim about real-world
fraud rates or patterns — see docs/ML_ENGINE.md limitations: any real
deployment must retrain on this tenant's actual labeled data before its
scores mean anything.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

HIGH_RISK_COUNTRIES = ("KY", "NG")
NORMAL_COUNTRIES = ("US", "GB", "DE", "FR", "SG")


def generate_synthetic_dataset(
    n_customers: int = 200, avg_transactions_per_customer: int = 25, seed: int = 42
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    base_time = datetime(2024, 1, 1)

    customers = []
    transactions = []
    txn_counter = 0

    for c in range(n_customers):
        customer_id = f"cust_{c:04d}"
        avg_amount = float(rng.uniform(50, 500))
        account_age_days = int(rng.uniform(30, 2000))
        customers.append(
            {
                "customer_id": customer_id,
                "average_transaction_amount": avg_amount,
                "account_opened_at": base_time - timedelta(days=account_age_days),
            }
        )

        n_txns = max(3, int(rng.poisson(avg_transactions_per_customer)))
        is_fraud_customer = rng.random() < 0.08  # ~8% of customers have an injected fraud episode

        t = base_time - timedelta(days=account_age_days) + timedelta(days=1)
        device = f"device_{c:04d}_a"
        for i in range(n_txns):
            t = t + timedelta(hours=float(rng.exponential(36)))
            amount = float(max(5.0, rng.normal(avg_amount, avg_amount * 0.3)))
            country = NORMAL_COUNTRIES[rng.integers(0, len(NORMAL_COUNTRIES))]
            label = 0

            # Inject a fraud-like episode near the end of this customer's history.
            if is_fraud_customer and i == n_txns - 1:
                episode = rng.integers(0, 3)
                if episode == 0:
                    # unusually large transfer to a high-risk country from a new device
                    amount = avg_amount * float(rng.uniform(15, 40))
                    country = HIGH_RISK_COUNTRIES[rng.integers(0, len(HIGH_RISK_COUNTRIES))]
                    device = f"device_{c:04d}_new_{i}"
                    label = 1
                elif episode == 1:
                    # structuring: this transaction is just under threshold, and so
                    # are a couple of injected predecessors a few days earlier
                    for j, back_days in enumerate((3, 6)):
                        transactions.append(
                            {
                                "transaction_id": f"txn_{txn_counter:07d}",
                                "customer_id": customer_id,
                                "amount": float(rng.uniform(9200, 9800)),
                                "counterparty_account": f"acct_{c:04d}_{i}",
                                "destination_country": country,
                                "counterparty_country": country,
                                "device_id": device,
                                "device_is_new": False,
                                "transaction_at": t - timedelta(days=back_days),
                                "is_fraud": 1,
                            }
                        )
                        txn_counter += 1
                    amount = float(rng.uniform(9200, 9800))
                    label = 1
                else:
                    # velocity burst: several rapid transactions right before this one
                    for j in range(6):
                        transactions.append(
                            {
                                "transaction_id": f"txn_{txn_counter:07d}",
                                "customer_id": customer_id,
                                "amount": float(rng.uniform(avg_amount * 0.8, avg_amount * 1.5)),
                                "counterparty_account": f"acct_burst_{c:04d}_{j}",
                                "destination_country": country,
                                "counterparty_country": country,
                                "device_id": device,
                                "device_is_new": False,
                                "transaction_at": t - timedelta(minutes=10 * (6 - j)),
                                "is_fraud": 1,
                            }
                        )
                        txn_counter += 1
                    label = 1

            transactions.append(
                {
                    "transaction_id": f"txn_{txn_counter:07d}",
                    "customer_id": customer_id,
                    "amount": amount,
                    "counterparty_account": f"acct_{c:04d}_{i % 5}",
                    "destination_country": country,
                    "counterparty_country": country,
                    "device_id": device,
                    "device_is_new": False,
                    "transaction_at": t,
                    "is_fraud": label,
                }
            )
            txn_counter += 1

    transactions_df = pd.DataFrame(transactions).sort_values(["customer_id", "transaction_at"]).reset_index(drop=True)
    customers_df = pd.DataFrame(customers)
    return transactions_df, customers_df
