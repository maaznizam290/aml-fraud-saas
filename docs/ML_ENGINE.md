# Fraud Detection Engine

Implemented on `feature/fraud-detection-engine`: the deterministic risk
engine, feature engineering, anomaly/supervised ML models, a provider
abstraction, a local model registry, and the prediction API. This is
**decision-support for a human analyst, not an autonomous regulatory
decision system** — see "Critical Rule alignment" below.

Out of scope here (owned by other branches): the Claude investigation
layer, Hermes learning engine, n8n orchestration, the dashboard, and any
autonomous account action.

## Architecture

```
Transaction + Customer + Prior History
        │
        ├─▶ Deterministic Risk Engine (13 named signals, always runs)
        │
        ├─▶ Feature Engineering (fraud_ml.features) ──▶ Anomaly Models (experimental)
        │                                            └─▶ Supervised Models (via a Provider)
        │
        └─▶ Risk Fusion (fraud_ml.fusion) ──▶ RiskAssessment (ESCALATE | CLEAR | REFER)
```

Everything is exposed through one boundary: `POST /api/ml/predict`
(`fraud_ml.api.app`). Nothing outside that module needs to know which
provider or algorithm produced a score.

## Consuming the Supabase schema, not competing with it

This branch was merged onto `feature/supabase-schema`'s work rather than
inventing parallel tables. In particular:

- `fraud_ml.schemas.RiskSignalType` has exactly the 13 values of the
  database's `risk_signal_type` enum
  (`supabase/migrations/20250101000002_enums.sql`).
- `fraud_ml.schemas.Disposition` has exactly the 3 values of
  `recommendation_disposition` (`ESCALATE | CLEAR | REFER`) — no
  autonomous-adverse-action value exists in either place.
- `fraud_ml.schemas.MLPredictionResult` is shaped to map directly onto the
  `ml_predictions` table (provider, model_name, prediction, score,
  confidence, features, metadata).
- `fraud_ml.models.registry.ModelRegistryEntry` mirrors the columns of the
  `model_versions` table (model_name, version, provider, model_type,
  status, metrics, configuration, created_by/approved_by, created_at) and
  reuses its exact governance vocabulary (`PROPOSED → REVIEW → APPROVED →
  VERSIONED → DEPLOYED`).

This service does not write to Supabase itself — that integration point
(inserting a `risk_signals`/`ml_predictions`/`ai_recommendations` row per
API response) belongs to whichever service calls this API, using the
`lib/supabase/types.ts` contracts from feature/supabase-schema.

## Deterministic risk engine (`fraud_ml.risk_engine`)

13 independently testable signal functions
(`fraud_ml/risk_engine/signals.py`), one per `risk_signal_type`: amount
anomaly, velocity, new beneficiary, new device, location anomaly, country
risk, customer risk, KYC status, sanctions result, historical behavior,
account age, transaction frequency, structuring. Every signal returns:

- `signal_type`, `triggered` (bool), `weight` (0–1)
- `explanation` — a plain-language sentence, not a score alone
- `context` — the raw numbers behind that sentence

`DeterministicRiskEngine.evaluate()` runs all 13 unconditionally, every
time — there is no code path that skips deterministic evidence because an
ML score was available. `aggregate_score()` takes the **max** triggered
weight (not a sum), so one severe signal isn't diluted by several weak
ones and the score never mechanically exceeds 1.0.

Thresholds (e.g. `AMOUNT_ZSCORE_THRESHOLD`, `VELOCITY_THRESHOLD`,
`STRUCTURING_MIN_OCCURRENCES`) are named module constants in `signals.py`
and `features/common.py` — tune them there, not by hunting for magic
numbers. `COUNTRY_RISK` uses a small illustrative default jurisdiction list
(`features/common.DEFAULT_HIGH_RISK_COUNTRIES`); a real deployment should
replace it with an actual tenant/FATF-driven policy list.

## Feature engineering (`fraud_ml.features`)

`features/common.py` holds the actual math (amount deviation, velocity,
new-beneficiary/device/country checks, country fan-out, account age,
structuring occurrences) — both the risk engine and the ML feature
builders call the same functions, so "what an analyst sees" and "what a
model saw" can never silently drift apart.

**Training vs. prediction, explicitly separated:**

- `features/prediction.py` — `build_prediction_features()` takes one
  (transaction, customer, history) triple and returns one feature row, for
  the live API path.
- `features/training.py` — `build_training_dataset()` takes a full
  transactions/customers DataFrame and computes the same named features in
  bulk, via a DuckDB SQL query with correlated subqueries strictly
  filtered to `p.transaction_at < t.transaction_at` (every prior-history
  aggregate — velocity, frequency, unique beneficiaries, structuring count,
  country fan-out, z-score — is computed that way). That's the one rule
  that prevents data leakage in a dataset like this, and putting it in one
  SQL statement makes it auditable in one place instead of scattered across
  `.shift()`/`.expanding()` calls.

`tests/test_features.py::TestTrainingPredictionParity` cross-checks a
hand-built example through both paths and asserts every feature name
produces an identical number — this is the regression test that would
catch the two paths drifting apart.

Feature list (`features.prediction.FEATURE_NAMES`): `amount`,
`amount_deviation_from_profile`, `amount_zscore_vs_history`,
`velocity_2h`, `frequency_24h`, `unique_beneficiaries`,
`is_new_beneficiary`, `is_new_device`, `is_new_country`,
`country_fanout_7d`, `account_age_days`, `structuring_occurrences_10d`,
`history_size`.

A z-score against a customer's own history is `None` (→ `0.0` in the final
vector) both when there's too little history (<3 prior transactions) *and*
when that history has zero variance — a z-score is mathematically
undefined there, and treating it as `0`/`inf` would make a handful of
identical past transactions look infinitely anomalous for any deviation at
all. (This was an actual bug caught by the test suite during development —
see "Known limitations".)

## Models (`fraud_ml.models`)

**Anomaly (experimental, unsupervised)** — `models/anomaly.py`:
`IsolationForestAnomalyModel`, `LocalOutlierFactorAnomalyModel`,
`OneClassSVMAnomalyModel`, `KMeansAnomalyModel` (anomaly proxied as
distance to the nearest cluster centroid). All four share one interface
(`fit`/`score_samples`/`predict`), scale features internally
(`StandardScaler`), and min-max normalize their raw score against the
*training* distribution so scores are roughly comparable across algorithms
— never a calibrated probability, and always labeled experimental in
`AnomalyResult.note`.

**Supervised baselines** — `models/supervised.py`: `LogisticRegressionBaseline`
(class-balanced) and `XGBoostBaseline` (`scale_pos_weight` set from the
actual training class balance). Both implement `SupervisedModel`
(`fit`/`predict_proba`/`predict`), and inherit `evaluate()` from
`models/base.py`, which computes precision, recall, F1, ROC-AUC (`None`
when the evaluation set has a single class — undefined otherwise, not
fabricated), a confusion matrix, and echoes the threshold/config used —
`EvaluationMetrics.to_dict()` is what a training run should log/register,
never a bare adjective like "high accuracy."

## Provider abstraction (`fraud_ml.providers`)

`MLProvider.predict(transaction, customer, history) -> MLPredictionResult`
is the entire contract. `LocalMLProvider` is the default: it resolves a
model via `ModelRegistry` (preferring `status=DEPLOYED`, falling back to
the latest of any status so a freshly-trained-but-not-yet-approved model
still works in a demo), loads it (cached in memory), and scores it.
`HuggingFaceMLProvider` is the documented future path — it speaks the same
interface and calls the real HF Inference API, but is unconfigured by
default (no `HUGGINGFACE_MODEL_ID`/`HUGGINGFACE_API_TOKEN`) and raises
`MLInferenceError` immediately rather than silently doing nothing. Neither
provider is ever allowed to return a fabricated score — see "Safe failure."

## Model registry (`fraud_ml.models.registry`)

A local, file-backed registry (`<dir>/registry.json` + one `.joblib` per
version) so `docs/ML_ENGINE.md` can describe a real, working governance
flow without requiring a live Supabase connection from this branch. The
one rule it exists to enforce: **`register()` refuses to silently
overwrite an existing `(model_name, version)`** — it raises `ValueError`
unless the caller explicitly passes `force=True`. This was directly
tested (`tests/test_registry.py::test_never_silently_replaces_a_version`)
by asserting the original artifact is untouched after a rejected
duplicate registration.

`scripts/train_baselines.py` always registers with `status="REVIEW"` —
promotion to `DEPLOYED` is a deliberate, separate, human/governance step
this script does not perform itself.

## Prediction API (`POST /api/ml/predict`)

Request: `transaction`, `customer`, `recent_transactions` (validated
Pydantic models — negative amounts, malformed enums, etc. are rejected
with `422`). The endpoint additionally filters `recent_transactions` down
to strictly `transaction_at < transaction.transaction_at` server-side, so
a caller cannot (even accidentally) leak "future" transactions into the
features/signals for the one being scored.

Response (`PredictResponse`): `status` (`ok`/`degraded`), `risk_signals`
(all 13, always), `feature_summary` (the literal feature vector used —
nothing hidden), `anomaly_results`, `supervised_results`, `ml_prediction`,
`risk_assessment`, `errors`.

## Risk fusion (`fraud_ml.fusion`)

Per the Critical Rule, the final assessment never depends solely on ML:

- Deterministic signals already fold in behavioral signals
  (`HISTORICAL_BEHAVIOR`, `ACCOUNT_AGE`, `TRANSACTION_FREQUENCY`,
  `VELOCITY_ANOMALY`) and KYC/sanctions context (`KYC_STATUS`,
  `SANCTIONS_RESULT`, `CUSTOMER_RISK`) as first-class signal types, not an
  ML side-channel.
- When an ML score is available, the combined score is
  `0.6 × deterministic_max + 0.4 × ml_score` — deterministic evidence is
  always the majority weight.
- When ML is unavailable (`ml_contributed=False`), the combined score is
  the deterministic max alone — fusion still produces a complete,
  explainable `RiskAssessment`.
- A confirmed sanctions match forces `ESCALATE` regardless of the blended
  score — a policy floor, not something ML can override.
- The only output is `Disposition` (`ESCALATE | CLEAR | REFER`) plus a
  `rationale` string, `contributing_signals`, and whether ML contributed.
  This is a recommendation for a human analyst
  (`analyst_decisions`/`ai_recommendations` in the DB schema) — it is never
  wired to any account action.

`tests/test_fusion.py` directly asserts a maximal ML score on otherwise
clean deterministic evidence cannot reach `ESCALATE` on its own — that's
the executable form of "never depends solely on ML."

## Safe failure

`MLInferenceError` is the only way a provider is allowed to signal
failure — missing model, corrupt artifact, network failure, whatever.
`fraud_ml.fusion.run_ml_provider_safely()` catches it and returns
`(None, error_message)`; the API then returns **HTTP 200** with
`status="degraded"`, `ml_prediction: null`, and the error message in
`errors` — `risk_signals` and `risk_assessment` are still fully populated
from deterministic evidence, so a human investigation is never blocked by
an ML outage. Anomaly-model failures are handled the same way per-model
(logged into `errors`, that one model's result omitted) rather than
failing the whole request. An unexpected bug elsewhere in the service is
the one case that *does* return HTTP 500 (via a top-level exception
handler) — a clearly-broken response is safer than one that looks
successful but silently omitted something.

## Training vs. inference

Deliberately separate processes. `scripts/train_baselines.py` generates a
synthetic dataset (`scripts/synthetic_data.py`), builds point-in-time
features via DuckDB, trains + evaluates every model, and registers each
one. The API (`fraud_ml.api.app`) only ever *loads* what's already in the
registry — there is no retrain-on-request code path, so inference latency
doesn't depend on training cost.

Run it:

```bash
cd ml-engine
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=src python scripts/train_baselines.py
```

Serve the API:

```bash
cd ml-engine
PYTHONPATH=src uvicorn fraud_ml.api.app:app --reload
```

## Reproducibility

- `requirements.txt` pins exact versions this branch was built and tested
  against (see file for the list); `pyproject.toml` carries looser ranges
  for actual consumers.
- `fraud_ml.config.settings.random_seed` (env `FRAUD_ML_RANDOM_SEED`,
  default `42`) seeds every stochastic model (`IsolationForest`, `KMeans`,
  `LogisticRegression`, `XGBoost`) and the synthetic data generator.
- Every registered model's `training_metadata` records `n_train`/`n_test`,
  the exact feature name list, the random seed, and the installed
  scikit-learn/XGBoost versions — enough to explain why a number changed
  between runs.
- `EvaluationMetrics` is always computed against a held-out split
  (`scripts/train_baselines.py` uses a stratified 75/25 split) — no metric
  in this codebase is asserted without one behind it.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `FRAUD_ML_REGISTRY_DIR` | `artifacts` (relative to CWD — run from `ml-engine/`) | Where the model registry + serialized models live |
| `FRAUD_ML_ESCALATE_THRESHOLD` | `0.75` | Fusion: combined score at/above this → `ESCALATE` |
| `FRAUD_ML_REVIEW_THRESHOLD` | `0.40` | Fusion: combined score at/above this → `REFER` |
| `FRAUD_ML_RANDOM_SEED` | `42` | Seeds all stochastic models + synthetic data |
| `HUGGINGFACE_API_TOKEN` | unset | Only used by the experimental, opt-in `HuggingFaceMLProvider` |
| `HUGGINGFACE_MODEL_ID` | unset | Same |

Thresholds are configuration, not a hardcoded business decision — a real
deployment should source these per-tenant (mirroring
`organization_settings.risk_thresholds` in the Supabase schema) rather
than from process-wide env vars.

## Limitations

- **Synthetic training data only.** `scripts/synthetic_data.py` generates
  data with obvious, extreme injected fraud patterns (structuring/velocity
  bursts/oversized transfers to a placeholder high-risk country) purely so
  the training pipeline and API have something real to run against. The
  near-perfect precision/recall/ROC-AUC numbers this produces
  (see the script's own printed output) are an artifact of that — **they
  are not a claim about real-world performance**, and must not be quoted
  as a benchmark. A real deployment must retrain on this tenant's actual
  labeled historical data before any score means anything.
- **Registry is local/file-based**, not yet integrated with a live
  Supabase `model_versions` table — that write path belongs to whichever
  service owns the DB connection (see "Consuming the Supabase schema").
- **`HuggingFaceMLProvider` is unconfigured and untested against a real
  endpoint** — the request/response shape it assumes (`{"inputs": ...}` in,
  `{"score": ...}` out) is a reasonable default, not a specification of any
  particular hosted model; adjust it for whatever model is actually
  deployed there.
- **DuckDB feature-building uses correlated subqueries per row**, which is
  fast enough for this project's target data volumes (the demo seed data
  from feature/supabase-schema: ~600 transactions; comfortably into the
  tens of thousands in informal testing) but is not the query plan you'd
  want at millions of rows — a windowed/incremental approach would be the
  next optimization if that's ever needed.
- **Governance status transitions aren't state-machine-enforced** —
  `ModelRegistry` will accept any of the five valid statuses at any time;
  enforcing that promotion actually follows `PROPOSED → REVIEW → APPROVED →
  VERSIONED → DEPLOYED` in order is a policy for whichever layer owns
  approving models, not something this file enforces.
- **The elevated-risk country list is a small illustrative placeholder**
  (`features/common.DEFAULT_HIGH_RISK_COUNTRIES`), not a real sanctions or
  FATF list — replace it with actual tenant policy before relying on
  `COUNTRY_RISK`.
- Not executed against a live Supabase instance from this branch (no
  network dependency was needed — the schema was only *read* to keep
  contracts in sync, per "Consuming the Supabase schema").

## MVP scope statement

This service produces **recommendations and investigation evidence for a
human analyst.** It does not, and must never, autonomously close an
account, file a SAR/STR, move funds, deny a customer, or release funds —
see `CLAUDE.md`'s Critical Rule. Every code path that could plausibly be
mistaken for a decision (`Disposition`, `RiskAssessment`) is documented
above as a recommendation only, and the test suite
(`tests/test_fusion.py`, mirroring the equivalent check in
feature/supabase-schema) asserts no autonomous-adverse-action value exists
in any enum this service defines.
