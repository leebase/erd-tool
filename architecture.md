# Architecture

## Current architecture

- Primary language: TypeScript/Python.
- Current seed package: Python under `src/erd_tool/`.
- Default worker runtime: `codex_cli`.
- Smoke surface: `python3 scripts/smoke.py`.
- Test surface: `python3 -m pytest tests`.

## Direction

Durable components should evolve in this order:

1. Database provider.
2. Metadata extraction.
3. Canonical physical model.
4. Diagram engine.
5. Editing engine.
6. Forward engineering.
7. Project storage.
8. Documentation generation.

The canonical physical model is the center of the system. Provider, renderer,
documentation, and DDL features should target it rather than bypassing it.
