#!/usr/bin/env python3
"""Minimal long-running process for Agent-Orch smoke checks."""

from __future__ import annotations

import signal
import time


_running = True


def _stop(_signum: int, _frame: object) -> None:
    global _running
    _running = False


signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)

while _running:
    time.sleep(0.1)
