"""Project file serialization for canonical physical models."""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Mapping

from erd_tool.model import PhysicalModel


PROJECT_VERSION = "1"
_TOP_LEVEL_REQUIRED = frozenset({"project_version", "physical_model"})
_TOP_LEVEL_ALLOWED = frozenset({"project_version", "physical_model", "diagram_layout"})
_LAYOUT_KEYS = frozenset({"nodes", "viewport"})
_VIEWPORT_KEYS = frozenset({"x", "y", "zoom"})
_NODE_KEYS = frozenset({"x", "y"})


class ProjectSerializationError(ValueError):
    """Raised when project data cannot be decoded into the canonical model."""


@dataclass(frozen=True)
class NodePosition:
    """Canvas position for a table node."""

    x: float
    y: float

    def __post_init__(self) -> None:
        object.__setattr__(self, "x", _require_number(self.x, "x"))
        object.__setattr__(self, "y", _require_number(self.y, "y"))

    def to_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y}


@dataclass(frozen=True)
class Viewport:
    """Canvas viewport."""

    x: float
    y: float
    zoom: float

    def __post_init__(self) -> None:
        object.__setattr__(self, "x", _require_number(self.x, "x"))
        object.__setattr__(self, "y", _require_number(self.y, "y"))
        zoom = _require_number(self.zoom, "zoom")
        if zoom <= 0:
            raise ProjectSerializationError("zoom must be a positive number")
        object.__setattr__(self, "zoom", zoom)

    def to_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y, "zoom": self.zoom}


@dataclass(frozen=True)
class DiagramLayout:
    """Diagram layout separate from the canonical physical model."""

    nodes: Mapping[str, NodePosition]
    viewport: Viewport

    def __post_init__(self) -> None:
        if not isinstance(self.nodes, Mapping):
            raise ProjectSerializationError("nodes must be an object")
        typed_nodes = {
            _require_nonblank_str(key, "node id"): (
                value
                if isinstance(value, NodePosition)
                else _node_position_from_dict(value)
            )
            for key, value in self.nodes.items()
        }
        object.__setattr__(self, "nodes", typed_nodes)
        if not isinstance(self.viewport, Viewport):
            raise ProjectSerializationError("viewport must be a Viewport")

    def to_dict(self) -> dict[str, object]:
        return {
            "nodes": {
                table_id: position.to_dict()
                for table_id, position in sorted(self.nodes.items())
            },
            "viewport": self.viewport.to_dict(),
        }


@dataclass(frozen=True)
class ProjectDocument:
    """Loaded project document."""

    physical_model: PhysicalModel
    diagram_layout: DiagramLayout


def default_diagram_layout() -> DiagramLayout:
    return DiagramLayout(
        nodes={},
        viewport=Viewport(x=0.0, y=0.0, zoom=1.0),
    )


def save_project_model(
    model: PhysicalModel,
    diagram_layout: DiagramLayout | None = None,
) -> dict[str, object]:
    """Serialize a canonical physical model into JSON-ready project data."""

    if not isinstance(model, PhysicalModel):
        raise ProjectSerializationError("physical_model must be a PhysicalModel")
    layout = diagram_layout if diagram_layout is not None else default_diagram_layout()
    if not isinstance(layout, DiagramLayout):
        raise ProjectSerializationError("diagram_layout must be a DiagramLayout")
    _validate_layout_table_ids(layout, model)

    return {
        "project_version": PROJECT_VERSION,
        "physical_model": model.to_dict(),
        "diagram_layout": layout.to_dict(),
    }


def load_project(project_data: object) -> ProjectDocument:
    """Load a project document from JSON-decoded project data."""

    if not isinstance(project_data, dict):
        raise ProjectSerializationError("Project data must be a top-level object")

    missing = _TOP_LEVEL_REQUIRED.difference(project_data)
    if missing:
        raise ProjectSerializationError(
            f"project is missing required {', '.join(sorted(missing))}"
        )
    unexpected = set(project_data).difference(_TOP_LEVEL_ALLOWED)
    if unexpected:
        raise ProjectSerializationError(
            "project has unexpected field "
            f"{', '.join(sorted(str(key) for key in unexpected))}"
        )

    project_version = project_data["project_version"]
    if project_version != PROJECT_VERSION:
        raise ProjectSerializationError(
            f"Unsupported project_version {project_version!r}; expected {PROJECT_VERSION!r}"
        )

    physical_model_data = project_data["physical_model"]
    if not isinstance(physical_model_data, dict):
        raise ProjectSerializationError("physical_model must be an object")

    try:
        physical_model = PhysicalModel.from_dict(physical_model_data)
    except ValueError as exc:
        raise ProjectSerializationError(str(exc)) from exc

    if "diagram_layout" in project_data:
        diagram_layout = _diagram_layout_from_dict(project_data["diagram_layout"])
    else:
        diagram_layout = default_diagram_layout()
    _validate_layout_table_ids(diagram_layout, physical_model)

    return ProjectDocument(
        physical_model=physical_model,
        diagram_layout=diagram_layout,
    )


def load_project_model(project_data: object) -> PhysicalModel:
    """Load a canonical physical model from JSON-decoded project data."""

    return load_project(project_data).physical_model


def _diagram_layout_from_dict(data: object) -> DiagramLayout:
    if not isinstance(data, dict):
        raise ProjectSerializationError("diagram_layout must be an object")
    _require_exact_keys(data, _LAYOUT_KEYS, "diagram_layout")
    nodes_data = data["nodes"]
    if not isinstance(nodes_data, dict):
        raise ProjectSerializationError("nodes must be an object")
    nodes = {
        _require_nonblank_str(table_id_value, "node id"): _node_position_from_dict(
            position
        )
        for table_id_value, position in nodes_data.items()
    }
    return DiagramLayout(
        nodes=nodes,
        viewport=_viewport_from_dict(data["viewport"]),
    )


def _node_position_from_dict(data: object) -> NodePosition:
    if not isinstance(data, dict):
        raise ProjectSerializationError("node position must be an object")
    _require_exact_keys(data, _NODE_KEYS, "node")
    return NodePosition(x=data["x"], y=data["y"])


def _viewport_from_dict(data: object) -> Viewport:
    if not isinstance(data, dict):
        raise ProjectSerializationError("viewport must be an object")
    _require_exact_keys(data, _VIEWPORT_KEYS, "viewport")
    return Viewport(x=data["x"], y=data["y"], zoom=data["zoom"])


def _validate_layout_table_ids(layout: DiagramLayout, model: PhysicalModel) -> None:
    table_ids = {table.id for table in model.tables}
    for node_id in layout.nodes:
        if node_id not in table_ids:
            raise ProjectSerializationError(
                f"diagram_layout references unknown table id {node_id!r}"
            )


def _require_exact_keys(
    data: dict[Any, Any],
    expected_keys: frozenset[str],
    object_name: str,
) -> None:
    missing_keys = expected_keys.difference(data)
    if missing_keys:
        missing = ", ".join(sorted(missing_keys))
        raise ProjectSerializationError(f"{object_name} is missing required {missing}")

    unexpected_keys = set(data).difference(expected_keys)
    if unexpected_keys:
        unexpected = ", ".join(str(key) for key in sorted(unexpected_keys, key=str))
        raise ProjectSerializationError(
            f"{object_name} has unexpected field {unexpected}"
        )


def _require_number(value: object, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ProjectSerializationError(f"{field} must be a number")
    number = float(value)
    if not math.isfinite(number):
        raise ProjectSerializationError(f"{field} must be finite")
    return number


def _require_nonblank_str(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProjectSerializationError(f"{field} must be a nonblank string")
    return value
