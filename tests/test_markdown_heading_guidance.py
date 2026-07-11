from __future__ import annotations

import importlib
import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_GUIDANCE_HEADING = "Markdown Heading Validation Guidance"
EXPECTED_MIN_CHARS_UNDER_HEADING = 80
GUIDANCE_API_MODULE = "erd_tool.markdown_heading_guidance"
GUIDANCE_TEMPLATE_PATHS = (
    "playbooks/templates/markdown_heading_validation_guidance.json",
    "playbooks/templates/markdown_heading_validation_guidance.yaml",
    "playbooks/templates/repair_before_review_feature_delivery.yaml",
)


def test_guidance_exposes_exact_heading_and_numeric_minimum_before_launch() -> None:
    source_name, guidance = _load_guidance_source()

    assert EXPECTED_GUIDANCE_HEADING in _searchable_text(guidance), (
        f"{source_name} must expose the exact heading text "
        f"{EXPECTED_GUIDANCE_HEADING!r} for generated playbooks."
    )
    assert EXPECTED_MIN_CHARS_UNDER_HEADING in _numeric_values(guidance), (
        f"{source_name} must expose the numeric min_chars_under_heading "
        f"{EXPECTED_MIN_CHARS_UNDER_HEADING!r}, not only prose."
    )


def test_guidance_carries_heading_contract_into_worker_mission_and_retry_text() -> None:
    source_name, guidance = _load_guidance_source()

    mission_text = "\n".join(_strings_from_keys(guidance, ("mission",)))
    retry_text = "\n".join(_strings_from_keys(guidance, ("retry", "retry_message")))

    assert mission_text, f"{source_name} must expose worker-facing mission text."
    assert retry_text, f"{source_name} must expose worker-facing retry text."
    assert EXPECTED_GUIDANCE_HEADING in mission_text, (
        "Worker-facing mission text must include the exact markdown heading "
        f"{EXPECTED_GUIDANCE_HEADING!r}."
    )
    assert str(EXPECTED_MIN_CHARS_UNDER_HEADING) in mission_text, (
        "Worker-facing mission text must tell workers the required minimum "
        f"character count {EXPECTED_MIN_CHARS_UNDER_HEADING}."
    )
    assert EXPECTED_GUIDANCE_HEADING in retry_text, (
        "Retry guidance must repeat the exact markdown heading "
        f"{EXPECTED_GUIDANCE_HEADING!r} so failed governed steps repair the "
        "same contract the validator checks."
    )
    assert str(EXPECTED_MIN_CHARS_UNDER_HEADING) in retry_text, (
        "Retry guidance must repeat the required minimum character count "
        f"{EXPECTED_MIN_CHARS_UNDER_HEADING}."
    )


def test_guidance_manifest_includes_reusable_markdown_heading_validation_block() -> None:
    source_name, guidance = _load_guidance_source()
    validation_blocks = list(_markdown_heading_validation_blocks(guidance))

    assert validation_blocks, (
        f"{source_name} must expose a reusable markdown_headings_present "
        "validation block for generated playbooks."
    )
    assert any(
        EXPECTED_GUIDANCE_HEADING in block.get("headings", ())
        and block.get("min_chars_under_heading") == EXPECTED_MIN_CHARS_UNDER_HEADING
        for block in validation_blocks
    ), (
        f"{source_name} must expose one markdown_headings_present block with "
        f"headings including {EXPECTED_GUIDANCE_HEADING!r} and "
        f"min_chars_under_heading == {EXPECTED_MIN_CHARS_UNDER_HEADING}."
    )


def _load_guidance_source() -> tuple[str, Any]:
    api_guidance = _load_api_guidance()
    if api_guidance is not None:
        return GUIDANCE_API_MODULE, api_guidance

    for relative_path in GUIDANCE_TEMPLATE_PATHS:
        path = REPO_ROOT / relative_path
        if path.exists():
            return relative_path, _load_template_guidance(path)

    pytest.fail(
        "Expected reusable markdown heading guidance from "
        f"{GUIDANCE_API_MODULE} or one of {GUIDANCE_TEMPLATE_PATHS}."
    )


def _load_template_guidance(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    try:
        import yaml
    except ModuleNotFoundError:
        pytest.fail(
            f"{path} is not JSON, and PyYAML is unavailable to parse YAML guidance."
        )

    return yaml.safe_load(text)


def _load_api_guidance() -> Any | None:
    try:
        module = importlib.import_module(GUIDANCE_API_MODULE)
    except ModuleNotFoundError as exc:
        if exc.name == GUIDANCE_API_MODULE:
            return None
        raise

    for name in (
        "get_markdown_heading_validation_guidance",
        "markdown_heading_validation_guidance",
        "MARKDOWN_HEADING_VALIDATION_GUIDANCE",
    ):
        if hasattr(module, name):
            value = getattr(module, name)
            return value() if callable(value) else value

    exported_constants = {
        name: getattr(module, name)
        for name in dir(module)
        if name.isupper() and not name.startswith("_")
    }
    return exported_constants or None


def _markdown_heading_validation_blocks(guidance: Any) -> Iterable[Mapping[str, Any]]:
    for node in _walk(guidance):
        if (
            isinstance(node, Mapping)
            and node.get("type") == "markdown_headings_present"
        ):
            yield node


def _strings_from_keys(guidance: Any, key_fragments: tuple[str, ...]) -> Iterable[str]:
    for node in _walk(guidance):
        if not isinstance(node, Mapping):
            continue
        for key, value in node.items():
            normalized_key = str(key).lower()
            if (
                isinstance(value, str)
                and any(fragment in normalized_key for fragment in key_fragments)
            ):
                yield value


def _numeric_values(guidance: Any) -> set[int | float]:
    values: set[int | float] = set()
    for node in _walk(guidance):
        if isinstance(node, bool):
            continue
        if isinstance(node, (int, float)):
            values.add(node)
    return values


def _searchable_text(guidance: Any) -> str:
    return json.dumps(guidance, sort_keys=True, default=_json_default)


def _json_default(value: object) -> object:
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if hasattr(value, "__dict__"):
        return vars(value)
    return repr(value)


def _walk(value: Any) -> Iterable[Any]:
    yield value
    if isinstance(value, Mapping):
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list | tuple):
        for child in value:
            yield from _walk(child)
