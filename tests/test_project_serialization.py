from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from erd_tool.model import PhysicalModel
from erd_tool.project_serialization import (
    DiagramLayout,
    NodePosition,
    ProjectDocument,
    ProjectSerializationError,
    Viewport,
    load_project,
    load_project_model,
    save_project_model,
)
from erd_tool.snowflake import import_snowflake_ddl


FIXTURES = Path(__file__).resolve().parents[1] / "docs" / "fixtures"
SQL_FIXTURE = FIXTURES / "snowflake_round_trip_v1.sql"
MODEL_NAME = "snowflake-round-trip-v1"
FORBIDDEN_CREDENTIAL_OR_SESSION_KEYS = {
    "account",
    "connection",
    "host",
    "password",
    "private_key",
    "role",
    "session",
    "token",
    "warehouse",
}


def _full_model() -> PhysicalModel:
    return import_snowflake_ddl(
        SQL_FIXTURE.read_text(encoding="utf-8"),
        model_name=MODEL_NAME,
    )


def test_save_project_model_emits_full_model_and_default_layout() -> None:
    model = _full_model()

    project_data = save_project_model(model)

    assert list(project_data) == [
        "project_version",
        "physical_model",
        "diagram_layout",
    ]
    assert project_data["project_version"] == "1"
    assert project_data["physical_model"] == model.to_dict()
    assert project_data["diagram_layout"] == {
        "nodes": {},
        "viewport": {"x": 0.0, "y": 0.0, "zoom": 1.0},
    }
    assert json.loads(json.dumps(project_data)) == project_data
    assert FORBIDDEN_CREDENTIAL_OR_SESSION_KEYS.isdisjoint(
        _all_keys(project_data["physical_model"])
    )


def test_save_and_load_project_round_trips_nonempty_layout() -> None:
    model = _full_model()
    layout = DiagramLayout(
        nodes={
            "table:ANALYTICS.CORE.CUSTOMER": NodePosition(x=10.5, y=20.0),
            "table:ANALYTICS.CORE.ORDER_HEADER": NodePosition(x=-3.0, y=4.25),
        },
        viewport=Viewport(x=1.0, y=2.0, zoom=1.5),
    )

    project_data = save_project_model(model, diagram_layout=layout)
    document = load_project(project_data)

    assert isinstance(document, ProjectDocument)
    assert document.physical_model == model
    assert document.diagram_layout == layout
    assert save_project_model(
        document.physical_model, diagram_layout=document.diagram_layout
    ) == project_data


def test_load_project_accepts_legacy_missing_diagram_layout() -> None:
    model = _full_model()
    legacy = {
        "project_version": "1",
        "physical_model": model.to_dict(),
    }

    document = load_project(legacy)

    assert document.physical_model == model
    assert document.diagram_layout == DiagramLayout(
        nodes={},
        viewport=Viewport(x=0.0, y=0.0, zoom=1.0),
    )


def test_load_project_model_compatibility_returns_physical_model() -> None:
    model = _full_model()
    project_data = save_project_model(model)

    loaded = load_project_model(project_data)

    assert loaded == model
    assert loaded.to_dict() == model.to_dict()


def test_bool_is_not_accepted_as_layout_number() -> None:
    model = _full_model()
    project_data = save_project_model(model)
    project_data["diagram_layout"] = {
        "nodes": {"table:ANALYTICS.CORE.CUSTOMER": {"x": True, "y": 0}},
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    with pytest.raises(ProjectSerializationError, match="x|number|bool"):
        load_project(project_data)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_nonfinite_layout_numbers_are_rejected(value: float) -> None:
    model = _full_model()
    project_data = save_project_model(model)
    project_data["diagram_layout"]["viewport"]["zoom"] = value

    with pytest.raises(ProjectSerializationError, match="finite"):
        load_project(project_data)


def test_layout_rejects_unknown_table_ids() -> None:
    model = _full_model()
    project_data = save_project_model(model)
    project_data["diagram_layout"] = {
        "nodes": {"table:ANALYTICS.CORE.MISSING": {"x": 0, "y": 0}},
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    with pytest.raises(ProjectSerializationError, match="MISSING|unknown|table"):
        load_project(project_data)


def test_layout_must_not_duplicate_model_fields() -> None:
    model = _full_model()
    project_data = save_project_model(model)
    project_data["diagram_layout"] = {
        "nodes": {},
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "tables": [],
    }

    with pytest.raises(ProjectSerializationError, match="unexpected|tables"):
        load_project(project_data)


@pytest.mark.parametrize(
    ("project_data", "expected_message"),
    [
        pytest.param([], "top-level object", id="top-level-list"),
        pytest.param(
            {
                "project_version": "2",
                "physical_model": _full_model().to_dict(),
            },
            "project_version",
            id="unsupported-version",
        ),
        pytest.param(
            {"physical_model": _full_model().to_dict()},
            "project_version",
            id="missing-version",
        ),
        pytest.param(
            {"project_version": "1"},
            "physical_model",
            id="missing-physical-model",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": _full_model().to_dict(),
                "unexpected": True,
            },
            "unexpected",
            id="unknown-top-level-field",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": _full_model().to_dict(),
                "account": "ACC",
            },
            "unexpected|account",
            id="forbidden-account",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": _full_model().to_dict(),
                "session": {},
            },
            "unexpected|session",
            id="forbidden-session",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": {"name": MODEL_NAME},
            },
            "model_version|namespaces|tables|relationships|unexpected|missing",
            id="seed-only-physical-model-rejected",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": _full_model().to_dict(),
                "diagram_layout": {
                    "nodes": {},
                    "viewport": {"x": 0, "y": 0, "zoom": 1, "pan": True},
                },
            },
            "unexpected|pan",
            id="unknown-viewport-field",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": _full_model().to_dict(),
                "diagram_layout": {
                    "nodes": {
                        "table:ANALYTICS.CORE.CUSTOMER": {
                            "x": 0,
                            "y": 0,
                            "color": "red",
                        }
                    },
                    "viewport": {"x": 0, "y": 0, "zoom": 1},
                },
            },
            "unexpected|color",
            id="unknown-node-field",
        ),
        pytest.param(
            {
                "project_version": "1",
                "physical_model": _full_model().to_dict(),
                "diagram_layout": {
                    "nodes": {},
                    "viewport": {"x": 0, "y": 0, "zoom": 0},
                },
            },
            "zoom",
            id="non-positive-zoom",
        ),
    ],
)
def test_load_project_rejects_malformed_project_data(
    project_data: object,
    expected_message: str,
) -> None:
    with pytest.raises(ProjectSerializationError, match=expected_message):
        load_project(project_data)


def _all_keys(value: object) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        keys.update(str(key) for key in value)
        for nested in value.values():
            keys.update(_all_keys(nested))
    elif isinstance(value, list):
        for nested in value:
            keys.update(_all_keys(nested))
    return keys
