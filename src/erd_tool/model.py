"""Canonical physical model primitives."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PhysicalModel:
    """Small seed for the canonical model every provider will target."""

    name: str

    def to_dict(self) -> dict[str, str]:
        return {"name": self.name}
