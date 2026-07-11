"""Reusable markdown heading validation guidance for playbook authoring."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

GUIDANCE_HEADING = "Markdown Heading Validation Guidance"
MIN_CHARS_UNDER_HEADING = 80

_MISSION = (
    f"{GUIDANCE_HEADING}: when a step declares markdown_headings_present, "
    "copy every required heading string verbatim into the worker-facing "
    "mission, tell the worker to create Markdown headings with those exact "
    "texts, and when min_chars_under_heading is declared, state the exact "
    "numeric minimum. Create a Markdown heading with the exact text "
    f"{GUIDANCE_HEADING} and put at least {MIN_CHARS_UNDER_HEADING} "
    "non-whitespace characters under each required heading."
)
_RETRY_MESSAGE = (
    f"{GUIDANCE_HEADING}: retry wording must repeat every "
    "markdown_headings_present heading string verbatim, tell the worker to "
    "create Markdown headings with those exact texts, and repeat the exact "
    "min_chars_under_heading value. Create a Markdown heading with the exact "
    f"text {GUIDANCE_HEADING} and put at least {MIN_CHARS_UNDER_HEADING} "
    "non-whitespace characters under each required heading."
)

_GUIDANCE_TEMPLATE: Mapping[str, Any] = {
    "mission": _MISSION,
    "retry_message": _RETRY_MESSAGE,
    "validation": {
        "structural": [
            {
                "type": "markdown_headings_present",
                "path": "__MARKDOWN_PATH__",
                "headings": [GUIDANCE_HEADING],
                "min_chars_under_heading": MIN_CHARS_UNDER_HEADING,
            }
        ]
    },
}


def get_markdown_heading_validation_guidance() -> dict[str, Any]:
    """Return a fresh JSON-ready markdown heading validation guidance mapping.

    Each call returns an independent deep copy so callers cannot corrupt the
    module's reusable template by mutating the returned structure.
    """
    return deepcopy(_GUIDANCE_TEMPLATE)
