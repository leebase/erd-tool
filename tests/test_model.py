import json

from erd_tool.model import PhysicalModel


def test_physical_model_imports_from_canonical_model_module() -> None:
    assert PhysicalModel.__module__ == "erd_tool.model"


def test_physical_model_accepts_stable_model_name() -> None:
    model = PhysicalModel(name="operations-domain-model")

    assert model.name == "operations-domain-model"


def test_physical_model_serializes_to_provider_neutral_json_ready_dict() -> None:
    serialized = PhysicalModel(name="operations-domain-model").to_dict()
    provider_or_ui_keys = {
        "account",
        "canvas",
        "columns",
        "database",
        "edges",
        "nodes",
        "relationships",
        "role",
        "schema",
        "tables",
        "theme",
        "viewport",
        "warehouse",
    }

    assert serialized == {"name": "operations-domain-model"}
    assert json.loads(json.dumps(serialized)) == serialized
    assert provider_or_ui_keys.isdisjoint(serialized)
