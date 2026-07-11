#!/usr/bin/env python3
"""Installed-independent smoke check for the ERD tool seed package."""

from __future__ import annotations

import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from erd_tool.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main(["--smoke"]))
