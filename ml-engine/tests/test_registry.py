from __future__ import annotations

import pytest

from fraud_ml.models.registry import ModelRegistry, ModelRegistryEntry


def make_entry(**overrides) -> ModelRegistryEntry:
    defaults = dict(model_name="test-model", version="1.0.0", provider="local", model_type="logistic_regression")
    defaults.update(overrides)
    return ModelRegistryEntry(**defaults)


class TestModelRegistry:
    def test_register_and_load_round_trips(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        registry.register(make_entry(), model_object={"fake": "model"})

        loaded = registry.load_model("test-model", "1.0.0")
        assert loaded == {"fake": "model"}

    def test_never_silently_replaces_a_version(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        registry.register(make_entry(metrics={"f1": 0.5}), model_object="v1")

        with pytest.raises(ValueError, match="already registered"):
            registry.register(make_entry(metrics={"f1": 0.9}), model_object="v2")

        # the original artifact must be untouched
        assert registry.load_model("test-model", "1.0.0") == "v1"

    def test_force_replace_is_explicit(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        registry.register(make_entry(), model_object="v1")
        registry.register(make_entry(), model_object="v2", force=True)
        assert registry.load_model("test-model", "1.0.0") == "v2"

    def test_different_versions_coexist(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        registry.register(make_entry(version="1.0.0"), model_object="v1")
        registry.register(make_entry(version="1.1.0"), model_object="v1.1")
        assert len(registry.list_entries("test-model")) == 2

    def test_latest_filters_by_status(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        registry.register(make_entry(version="1.0.0", status="REVIEW"), model_object="v1")
        registry.register(make_entry(version="1.1.0", status="DEPLOYED"), model_object="v1.1")

        deployed = registry.latest("test-model", status="DEPLOYED")
        assert deployed is not None and deployed.version == "1.1.0"

        review = registry.latest("test-model", status="REVIEW")
        assert review is not None and review.version == "1.0.0"

    def test_latest_returns_none_when_nothing_matches(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        assert registry.latest("nonexistent-model") is None

    def test_invalid_status_rejected(self):
        with pytest.raises(ValueError):
            make_entry(status="NOT_A_REAL_STATUS")

    def test_load_missing_model_raises_key_error(self, tmp_path):
        registry = ModelRegistry(tmp_path)
        with pytest.raises(KeyError):
            registry.load_model("nope", "1.0.0")

    def test_registry_persists_across_instances(self, tmp_path):
        ModelRegistry(tmp_path).register(make_entry(), model_object="v1")
        reopened = ModelRegistry(tmp_path)
        assert reopened.get_entry("test-model", "1.0.0") is not None
        assert reopened.load_model("test-model", "1.0.0") == "v1"
