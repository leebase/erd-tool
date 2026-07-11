import json

import pytest

from erd_tool.model import PhysicalModel


MODEL_NAME = "operations-domain-model"
EXPECTED_PROJECT_DATA = {
    "project_version": "1",
    "physical_model": {"name": MODEL_NAME},
}
FORBIDDEN_PHYSICAL_MODEL_KEYS = {
    "account",
    "canvas",
    "connection",
    "database",
    "edges",
    "generated_at",
    "host",
    "nodes",
    "role",
    "schema",
    "session",
    "theme",
    "undo_history",
    "viewport",
    "warehouse",
}


def _project_serialization_api():
    from erd_tool.project_serialization import (
        ProjectSerializationError,
        load_project_model,
        save_project_model,
    )

    return ProjectSerializationError, load_project_model, save_project_model


def test_save_project_model_serializes_canonical_model_to_json_compatible_data() -> None:
    _, _, save_project_model = _project_serialization_api()

    project_data = save_project_model(PhysicalModel(name=MODEL_NAME))

    assert project_data == EXPECTED_PROJECT_DATA
    assert json.loads(json.dumps(project_data)) == EXPECTED_PROJECT_DATA
    assert FORBIDDEN_PHYSICAL_MODEL_KEYS.isdisjoint(project_data["physical_model"])


def test_load_project_model_round_trips_without_changing_canonical_content() -> None:
    _, load_project_model, save_project_model = _project_serialization_api()
    decoded_project_data = json.loads(json.dumps(EXPECTED_PROJECT_DATA))

    loaded_model = load_project_model(decoded_project_data)

    assert loaded_model == PhysicalModel(name=MODEL_NAME)
    assert loaded_model.to_dict() == {"name": MODEL_NAME}
    assert save_project_model(loaded_model) == EXPECTED_PROJECT_DATA


@pytest.mark.parametrize(
    ("project_data", "expected_message"),
    [
        pytest.param([], "top-level object", id="top-level-list"),
        pytest.param(
            {"project_version": "2", "physical_model": {"name": MODEL_NAME}},
            "project_version",
            id="unsupported-version",
        ),
        pytest.param(
            {"physical_model": {"name": MODEL_NAME}},
            "project_version",
            id="missing-version",
        ),
        pytest.param(
            {"project_version": "1"},
            "physical_model",
            id="missing-physical-model",
        ),
        pytest.param(
            {"project_version": "1", "physical_model": []},
            "physical_model",
            id="physical-model-list",
        ),
        pytest.param(
            {"project_version": "1", "physical_model": {}},
            "name",
            id="missing-name",
        ),
        pytest.param(
            {"project_version": "1", "physical_model": {"name": 42}},
            "name",
            id="non-string-name",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": {"name": MODEL_NAME},
                "unexpected": True,
            },
            "unexpected",
            id="unknown-top-level-field",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": {"name": MODEL_NAME, "tables": []},
            },
            "unexpected",
            id="unknown-physical-model-field",
        ),
    ],
)
def test_load_project_model_rejects_malformed_project_data_with_clear_exception(
    project_data: object,
    expected_message: str,
) -> None:
    ProjectSerializationError, load_project_model, _ = _project_serialization_api()

    with pytest.raises(ProjectSerializationError, match=expected_message):
        load_project_model(project_data)
