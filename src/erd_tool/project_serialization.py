"""Project file serialization for canonical physical models."""

from __future__ import annotations

from typing import Any

from erd_tool.model import PhysicalModel


PROJECT_VERSION = "1"
_TOP_LEVEL_KEYS = {"project_version", "physical_model"}
_PHYSICAL_MODEL_KEYS = {"name"}


class ProjectSerializationError(ValueError):
    """Raised when project data cannot be decoded into the canonical model."""


def save_project_model(model: PhysicalModel) -> dict[str, object]:
    """Serialize a canonical physical model into JSON-ready project data."""

    if not isinstance(model, PhysicalModel):
        raise ProjectSerializationError("physical_model must be a PhysicalModel")

    return {
        "project_version": PROJECT_VERSION,
        "physical_model": model.to_dict(),
    }


def load_project_model(project_data: object) -> PhysicalModel:
    """Load a canonical physical model from JSON-decoded project data."""

    if not isinstance(project_data, dict):
        raise ProjectSerializationError("Project data must be a top-level object")

    _require_exact_keys(project_data, _TOP_LEVEL_KEYS, "project")

    project_version = project_data["project_version"]
    if project_version != PROJECT_VERSION:
        raise ProjectSerializationError(
            f"Unsupported project_version {project_version!r}; expected {PROJECT_VERSION!r}"
        )

    physical_model_data = project_data["physical_model"]
    if not isinstance(physical_model_data, dict):
        raise ProjectSerializationError("physical_model must be an object")

    _require_exact_keys(physical_model_data, _PHYSICAL_MODEL_KEYS, "physical_model")

    model_name = physical_model_data["name"]
    if not isinstance(model_name, str):
        raise ProjectSerializationError("physical_model.name must be a string")

    return PhysicalModel(name=model_name)


def _require_exact_keys(
    data: dict[Any, Any],
    expected_keys: set[str],
    object_name: str,
) -> None:
    missing_keys = expected_keys.difference(data)
    if missing_keys:
        missing = ", ".join(sorted(missing_keys))
        raise ProjectSerializationError(f"{object_name} is missing required {missing}")

    unexpected_keys = set(data).difference(expected_keys)
    if unexpected_keys:
        unexpected = ", ".join(str(key) for key in sorted(unexpected_keys, key=str))
        raise ProjectSerializationError(f"{object_name} has unexpected field {unexpected}")
