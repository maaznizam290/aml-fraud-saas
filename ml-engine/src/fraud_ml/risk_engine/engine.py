"""The deterministic risk engine: runs all 13 signals and exposes them as a
flat, independently testable list. No ML, no opaque scoring — every number
here traces back to a named signal with a plain-language explanation."""
from __future__ import annotations

from fraud_ml.risk_engine.signals import ALL_SIGNAL_FUNCTIONS
from fraud_ml.schemas import CustomerContext, RiskSignalResult, TransactionContext, TransactionHistoryItem


class DeterministicRiskEngine:
    def evaluate(
        self,
        transaction: TransactionContext,
        customer: CustomerContext,
        history: list[TransactionHistoryItem] | None = None,
    ) -> list[RiskSignalResult]:
        history = history or []
        return [fn(transaction, customer, history) for fn in ALL_SIGNAL_FUNCTIONS]

    @staticmethod
    def aggregate_score(signals: list[RiskSignalResult]) -> float:
        """A simple, transparent aggregate: the max weight among triggered
        signals, not a sum (so one severe signal isn't diluted by several
        weak ones, and the score never exceeds 1.0). This is the
        *deterministic* contribution to risk fusion — see fraud_ml.fusion,
        which combines it with ML output rather than using it alone."""
        triggered_weights = [s.weight for s in signals if s.triggered]
        return max(triggered_weights, default=0.0)
