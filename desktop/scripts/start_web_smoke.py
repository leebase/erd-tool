#!/usr/bin/env python3
"""Start the existing drawDB Vite app for the governed baseline smoke gate."""

from __future__ import annotations

import os


def main() -> None:
    os.execvp(
        "npm",
        [
            "npm",
            "run",
            "dev",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            "4173",
        ],
    )


if __name__ == "__main__":
    main()
