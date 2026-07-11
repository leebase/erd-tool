# Review: Verified Executable Model Scaffold

**Date:** 2026-07-08  
**Scope:** `src/erd_tool/model.py`, `src/erd_tool/__init__.py`, `src/erd_tool/cli.py`, `tests/test_model.py`, `tests/smoke_start.py`, `scripts/smoke.py`, `tests/smoke_manifest.json`  
**Gate threshold:** High — verdict is fail only when at least one finding is High or Critical.

---

## Checks Run

| Command | Exit Code | Summary |
|---|---|---|
| `python3 -m compileall src tests` | 0 | All 5 source files (`model.py`, `cli.py`, `__init__.py`, `smoke_start.py`, `test_model.py`) compiled without syntax errors. |

**Additional evidence (not in checks_run per gate rules):**

- `python3 -m pytest tests/test_model.py -v` → 3 passed, 0 failed, 0.01s.
- `artifacts/user-smoke/result.json`: `app_started: true`, `core_flow_completed: true`, `start_exit_code: 0`, `check_exit_code: 0`. Smoke ran at 2026-07-08T22:17:17Z and completed in ~3 seconds.

---

## Summary

The scaffold is a clean, minimal seed. `PhysicalModel` is a frozen dataclass with a single `name` field and a `to_dict()` that returns only `{"name": self.name}` — no provider or UI keys leak in. The three model tests cover module location, name round-trip, and serialization with explicit provider-key exclusion. The smoke harness (manifest → `smoke_start.py` long-running process → `scripts/smoke.py` check) works end-to-end. All compilation, tests, and smoke checks pass.

Three Low findings are recorded. None reach High or Critical; the verdict is **pass**.

---

## Lens Notes

### Correctness

`PhysicalModel` is `frozen=True`, preventing accidental mutation after construction. `to_dict()` is a direct field-copy with no conditional paths. The `cli.py` smoke path instantiates the model and serializes it via `json.dumps` — no error paths exist to mishandle at this stage.

One cosmetic defect: `main()` in `cli.py` calls `build_parser()` twice when invoked with no arguments — once to parse (line 22) and once to print help (line 27). The second call should reuse the `parser` local already in scope. This is **F001** (Low).

`test_physical_model_serializes_to_provider_neutral_json_ready_dict` asserts `serialized == {"name": "operations-domain-model"}` as an exact equality check. This acts as a strong scope-creep regression guard — any new field on `PhysicalModel` that appears in `to_dict()` will immediately break it. This is intentional and correct; no finding.

### Test Coverage

The three tests together form a reasonable gate for a seed model: they verify the import path, the constructor, and the full serialization contract. No negative-path tests exist (empty string name, Unicode name, name with whitespace). At scaffold stage this is acceptable; it should be addressed before the first implementation slice adds validation. Recorded as **F002** (Low) so it is not forgotten.

### Architecture Alignment

`PhysicalModel` carries no provider, schema, canvas, or UI fields, consistent with the AGENTS.md constraint to "strengthen the canonical physical model rather than bypassing it." `cli.py` correctly targets the model and does not introduce a separate data shape. `scripts/smoke.py` adds `src/` to `sys.path` for installed-independent execution — this correctly matches `architecture.md`'s "installed-independent smoke check" surface. No architecture-alignment issues.

### Maintainability

`tests/smoke_start.py` handles SIGINT and SIGTERM using a module-level `_running` flag with `global _running` assignment inside the signal handler. This is functionally correct for a single-threaded process. It is recorded as **F003** (Low) because the bare-global pattern is slightly fragile if the file is ever extended with threads — a `threading.Event` would be more robust — but it is not a defect at current scope.

---

## Findings

| ID | Severity | File | Location |
|---|---|---|---|
| F001 | Low | `src/erd_tool/cli.py` | `main()`, lines 22–27 |
| F002 | Low | `tests/test_model.py` | entire file |
| F003 | Low | `tests/smoke_start.py` | lines 10–21 |

### F001 — `build_parser()` called twice in the no-args path

`main()` binds `build_parser().parse_args(argv)` to `args` at line 22, so `parser` is in scope. The else-branch at line 27 calls `build_parser().print_help()` — constructing a fresh parser — instead of `parser.print_help()`. The `parser` variable from line 22 should be used.

### F002 — No negative-path tests for `PhysicalModel` construction

All three tests use a well-formed name (`"operations-domain-model"`). There are no tests for empty string, whitespace-only, or very long names. If the model gains validation in a future slice, the test suite will not cover regressions in those edge cases. Add at least one negative-path test when the first validation constraint is introduced.

### F003 — Signal handler uses module-level mutable global

The `_running = True` global and `global _running` assignment inside `_stop` work correctly for a single-threaded smoke process. If the file is ever extended to run work on background threads, the bare global becomes a race condition. Consider replacing with `threading.Event` when threads are introduced.
