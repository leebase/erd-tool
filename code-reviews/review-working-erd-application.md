# Code Review — Working ERD Application

**Date**: 2026-07-11
**Reviewer**: `gpt-5.6-terra-high` (independent, read-only)
**Scope**: Full uncommitted delivery diffs in `erd-tool` and the public
`leebase/drawdb` fork
**Diff bases**: `erd-tool` `e04b78c`; drawDB upstream fork base
`b24ad20b6588b9b99609e8a03b87efa7b28cf245`

## Architecture Summary

`erd-tool` owns the strict canonical physical model, SQLite/Snowflake
translation, project envelope, CLI, and local server. The drawDB fork owns the
React editor projection, browser persistence, Snowflake interaction surface,
and ELK layout adapter. Credentials and connection state remain outside both
the canonical model and browser project. Generated Snowflake PK/UQ/FK
constraints are informational `NOT ENFORCED`; FKs are deferred so cycles work.

## Checks Run

| Check | Result |
|---|---|
| Python test suite | Pass — 119 tests |
| Python compilation | Pass |
| drawDB adapter/layout suite | Pass — 46 tests |
| ESLint | Pass |
| Vite production build | Pass |
| Real cross-repository Playwright flow | Pass |
| Agent-Orch doctor | Ready |
| Live Chinook SQLite → Snowflake structure gate | Pass |
| Repository diff/credential checks | Pass |

## Findings

No open Critical, High, or Medium findings. The reviewer issued final verdict
`PASS` after repair iterations covering parser fidelity, canonical invariants,
identifier normalization, multi-schema/legacy/empty projects, comments and
defaults, constraint semantics, layout/browser state, and browser/backend
validation parity.

## Lens Notes

| Lens | Result |
|---|---|
| Correctness and errors | Quote-aware SQL, deterministic IDs/order, cycles, comments, defaults, and failure paths have focused coverage. |
| Security | No credential surface; strict project allowlists; read-only SQLite URI; loopback-only server default. |
| Edge cases | Empty/legacy/multi-schema models, Unicode/whitespace names, duplicate constraints, partial indexes, and cyclic/self FKs are covered. |
| Dependencies | Exact `elkjs@0.11.1`; drawDB/elk provenance and licenses recorded. |
| Code quality | Canonical semantics and editor projection remain separated by adapters. |
| Tests | Unit, CLI, real subprocess, browser, manual UI, and live Snowflake evidence cover the assembled seams. |
| Documentation | README, architecture, sprint, context, result review, and milestone handoff describe the implemented state. |

## Non-Blocking Risks

- The inherited drawDB bundle remains large and emits upstream bundle/eval
  warnings; this delivery does not introduce that code path.
- Row-data movement and live Snowflake metadata extraction are intentionally
  outside the completed structural milestone.
- SQLite partial unique indexes are rejected until predicate semantics are
  modeled, preventing silent schema strengthening.
