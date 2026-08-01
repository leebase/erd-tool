#!/usr/bin/env python3
"""Verify the drawDB web baseline is reachable and its ERD tests pass."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:4173/"


def main() -> int:
    try:
        with urlopen(URL, timeout=5) as response:
            body = response.read(512_000).decode("utf-8", errors="replace")
            if response.status != 200 or 'id="root"' not in body:
                return 1
    except OSError:
        return 1

    completed = subprocess.run(
        ["npm", "run", "test"],
        cwd=ROOT,
        check=False,
        timeout=120,
    )
    return completed.returncode


if __name__ == "__main__":
    sys.exit(main())
