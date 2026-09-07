"""Local, file-backed model registry. Mirrors the columns of the
`model_versions` table introduced in feature/supabase-schema
(supabase/migrations/20250101000017_model_governance.sql) so an entry here
maps 1:1 onto a row a maintainer can insert there — this registry does not
talk to Supabase itself (that integration belongs to whichever service owns
writing to the DB), it is the local source of truth for "what models exist
and where are their serialized artifacts" that a DB row would point at.

The one rule this file exists to enforce: a (model_name, version) pair is
registered once. Overwriting it silently would mean a running service could
start serving a different model under a version number an analyst already
saw on a past prediction/audit-log entry — `register()` refuses that unless
the caller explicitly passes `force=True`.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib

from fraud_ml.config import settings

GOVERNANCE_STATUSES = ("PROPOSED", "REVIEW", "APPROVED", "VERSIONED", "DEPLOYED")


@dataclass
class ModelRegistryEntry:
    model_name: str
    version: str
    provider: str
    model_type: str  # algorithm, e.g. "xgboost", "isolation_forest"
    status: str = "PROPOSED"
    metrics: dict[str, Any] = field(default_factory=dict)
    configuration: dict[str, Any] = field(default_factory=dict)
    training_metadata: dict[str, Any] = field(default_factory=dict)
    created_by: str | None = None
    approved_by: str | None = None
    approved_at: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    artifact_filename: str | None = None

    def __post_init__(self) -> None:
        if self.status not in GOVERNANCE_STATUSES:
            raise ValueError(f"status must be one of {GOVERNANCE_STATUSES}, got {self.status!r}")

    @property
    def key(self) -> str:
        return f"{self.model_name}@{self.version}"


class ModelRegistry:
    def __init__(self, directory: str | Path | None = None):
        self.directory = Path(directory or settings.model_registry_dir)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._index_path = self.directory / "registry.json"
        if not self._index_path.exists():
            self._write_index([])

    def _read_index(self) -> list[dict[str, Any]]:
        return json.loads(self._index_path.read_text())

    def _write_index(self, entries: list[dict[str, Any]]) -> None:
        self._index_path.write_text(json.dumps(entries, indent=2, sort_keys=True))

    def list_entries(self, model_name: str | None = None) -> list[ModelRegistryEntry]:
        entries = [ModelRegistryEntry(**e) for e in self._read_index()]
        if model_name:
            entries = [e for e in entries if e.model_name == model_name]
        return entries

    def get_entry(self, model_name: str, version: str) -> ModelRegistryEntry | None:
        for e in self.list_entries(model_name):
            if e.version == version:
                return e
        return None

    def register(
        self, entry: ModelRegistryEntry, model_object: Any = None, *, force: bool = False
    ) -> ModelRegistryEntry:
        existing = self.get_entry(entry.model_name, entry.version)
        if existing is not None and not force:
            raise ValueError(
                f"Model version {entry.key!r} is already registered "
                f"(registered {existing.created_at}). Bump the version instead of "
                f"overwriting it, or pass force=True if you really mean to replace it."
            )

        if model_object is not None:
            artifact_filename = f"{entry.model_name}--{entry.version}.joblib"
            joblib.dump(model_object, self.directory / artifact_filename)
            entry.artifact_filename = artifact_filename

        entries = [
            e
            for e in self._read_index()
            if not (e["model_name"] == entry.model_name and e["version"] == entry.version)
        ]
        entries.append(asdict(entry))
        self._write_index(entries)
        return entry

    def load_model(self, model_name: str, version: str) -> Any:
        entry = self.get_entry(model_name, version)
        if entry is None:
            raise KeyError(f"No registered model {model_name!r} version {version!r}")
        if not entry.artifact_filename:
            raise ValueError(f"Model {entry.key!r} has no serialized artifact (metadata-only entry)")
        return joblib.load(self.directory / entry.artifact_filename)

    def latest(self, model_name: str, status: str | None = "DEPLOYED") -> ModelRegistryEntry | None:
        candidates = self.list_entries(model_name)
        if status is not None:
            candidates = [e for e in candidates if e.status == status]
        if not candidates:
            return None
        return max(candidates, key=lambda e: e.created_at)
