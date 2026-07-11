## Overview

This contract defines the first governed implementation playbook for the
Snowflake fixture-oriented product slice. The selected item is: design the first
governed implementation playbook around a deterministic check.

The playbook this contract governs should be
`playbooks/snowflake-fixture-deterministic-check.yaml`. Its implementation
target is the first local Snowflake fixture path that turns the documented
fixture into canonical physical model evidence without requiring live Snowflake
credentials, network access, diagram runtime dependencies, project storage
workflows, or full DDL round-trip claims outside the existing contract.

The first implementation slice must stay fixture-first and model-centered:

- Read `docs/fixtures/snowflake_round_trip_v1.sql` as the local Snowflake input.
- Translate or load the fixture into the canonical `PhysicalModel` contract.
- Serialize the resulting model to JSON-compatible dictionaries.
- Compare the serialized value to
  `docs/fixtures/snowflake_round_trip_v1.json`.
- Prove deterministic behavior through automated local tests, not prose-only
  inspection.

The governed playbook may add source and test files in a later implementation
step, but the source of truth remains the canonical physical model. Snowflake
logic is an adapter around that model. It must not introduce a provider-native
graph as the durable internal representation.

## Problem

The repository is ready for the next product slice, but a code-producing
governed playbook can fail in ways that look successful if its gates are weak:
YAML can parse while Agent-Orch strict loading would reject it, markdown checks
can pass by substring instead of exact heading structure, review verdicts can
claim checks that were not actually executed, and smoke or review gates can be
accidentally dropped while adding the implementation steps.

The first Snowflake fixture implementation must avoid those failure modes before
it writes durable code. The playbook needs a deterministic, local oracle that is
small enough to diagnose:

- `ANALYTICS.CORE.CUSTOMER`
- `ANALYTICS.CORE.ORDER_HEADER`
- primary keys on both tables
- `ORDER_HEADER.CUSTOMER_ID` referencing `CUSTOMER.CUSTOMER_ID`
- supported v1 Snowflake type forms, nullability, defaults, and stable canonical
  ids

The deterministic check is the fixture-to-canonical-JSON comparison. Passing the
slice means the same local SQL fixture always produces the same canonical JSON
value and no provider/session/UI state leaks into `PhysicalModel`.

## Constraints

The authored playbook must preserve the existing Agent-Orch quality floor:

- Keep a real `smoke_runner` gate for the pinned user smoke oracle under
  `tests/smoke_manifest.json`, `tests/smoke_start.py`, and `scripts/smoke.py`.
- Keep a real review-verdict gate that writes both prose review and
  machine-readable verdict artifacts under `code-reviews/`.
- Validate the review verdict with `json_schema` using
  `builtin:review_verdict/v1`, `review_verdict_clean`, and system
  `checks_run_match`.
- Include only real commands in review verdict `checks_run`; every command listed
  must be safe to re-execute from the workspace and must report the actual exit
  code observed by the reviewer.
- Do not weaken smoke, pytest, format/lint/type, compile, or review gates to
  make the fixture slice pass.

Strict-load validation is required. The verification step for the authored
playbook must exercise the real Agent-Orch loader and strict linter, not only a
generic YAML parser. The required prelaunch check is:

```bash
python3 -m agent_orch.main lint-playbook --strict --json playbooks/snowflake-fixture-deterministic-check.yaml
```

That strict-load check must fail closed on duplicate YAML keys, malformed step
shape, weak review verdict schema contracts, misplaced `checks_run_match`, and
missing quality-floor gates. Any local environment path needed to import
`agent_orch` must be handled explicitly by the worker running the check, but the
playbook contract must not depend on a hidden parse-only shortcut.

Dry-run checks_run execution means the review verdict for this authored
playbook must record prelaunch, non-mutating proof commands in `checks_run`.
Those commands are the dry-run evidence that the playbook is launchable and that
the deterministic slice oracle is real before the playbook is used for a later
implementation run. At minimum, the review verdict should include:

- strict Agent-Orch playbook lint/load for
  `playbooks/snowflake-fixture-deterministic-check.yaml`
- a deterministic command proving the Snowflake fixture check exists in the
  authored playbook validation path
- the local Python test command used by the authored implementation slice
- a compile or equivalent syntax check for edited Python source and tests

The dry-run checks must not launch a detached governed run, rewrite workspace
state, depend on live Snowflake, or depend on network access.

Exact markdown-heading discipline is part of this contract. This document uses
exactly these Markdown headings and no others:

- `Overview`
- `Problem`
- `Constraints`
- `Acceptance Checks`

Any validation for this document must use line-anchored markdown heading checks
for those exact heading texts. The later plan/review documents may have their
own required headings, but their playbook validation must name the exact
headings it expects instead of relying on substring matches or prose mentions.

## Acceptance Checks

This contract is satisfied when
`docs/governed-deterministic-check-playbook-contract.md` exists and the next
governed steps can trace their work to these checks:

- The document contains the exact Markdown headings `Overview`, `Problem`,
  `Constraints`, and `Acceptance Checks`.
- The document defines the first Snowflake fixture-oriented governed slice as a
  local fixture-to-canonical-JSON implementation around
  `docs/fixtures/snowflake_round_trip_v1.sql` and
  `docs/fixtures/snowflake_round_trip_v1.json`.
- The document requires strict-load validation through the real Agent-Orch
  `lint-playbook --strict --json` path for
  `playbooks/snowflake-fixture-deterministic-check.yaml`.
- The document requires dry-run/prelaunch checks to be recorded in review verdict
  `checks_run` and re-executed by `checks_run_match`.
- The document explicitly preserves the pinned user smoke gate and the canonical
  review-verdict gate.
- The document prohibits live Snowflake credentials, network access,
  provider/session/UI fields in `PhysicalModel`, and claims of diagram, project
  storage, DDL generation, or full round-trip support beyond the implemented
  deterministic fixture check.
