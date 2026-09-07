"""Environment configuration. Plain env-var reads (no pydantic-settings
dependency) so this stays trivial to reason about and test."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    # Directory the local model registry (registry.json + serialized models)
    # lives in, relative to wherever the process is run from (the documented
    # usage — see scripts/train_baselines.py and docs/ML_ENGINE.md — is
    # always from inside ml-engine/, so this is "ml-engine/artifacts" from
    # the repo root, not "ml-engine/ml-engine/artifacts"). Never committed
    # with real trained artifacts by default.
    model_registry_dir: str = os.environ.get("FRAUD_ML_REGISTRY_DIR", "artifacts")

    # Optional: only used by HuggingFaceMLProvider, which is not wired up by
    # default. Never logged, never included in any API response.
    huggingface_api_token: str | None = os.environ.get("HUGGINGFACE_API_TOKEN")
    huggingface_model_id: str | None = os.environ.get("HUGGINGFACE_MODEL_ID")

    # Fusion thresholds — deliberately configuration, not a hardcoded
    # business decision baked into code (mirrors organization_settings
    # .risk_thresholds in the Supabase schema; a real deployment should read
    # these per-tenant rather than from process env).
    escalate_threshold: float = _env_float("FRAUD_ML_ESCALATE_THRESHOLD", 0.75)
    review_threshold: float = _env_float("FRAUD_ML_REVIEW_THRESHOLD", 0.40)

    random_seed: int = int(os.environ.get("FRAUD_ML_RANDOM_SEED", "42"))


settings = Settings()
