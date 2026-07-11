# Architecture

The governed implementation playbook will be
`playbooks/snowflake-fixture-deterministic-check.yaml`. Its purpose is to
author the first local Snowflake fixture implementation slice, not to launch
live Snowflake work or claim a complete product workflow.

The playbook content should keep the source of truth in the canonical
`PhysicalModel` path documented in `architecture.md`. Snowflake code is an
adapter around the model: it reads `docs/fixtures/snowflake_round_trip_v1.sql`,
translates the supported v1 fixture objects into `PhysicalModel`, serializes to
JSON-compatible dictionaries, compares the value with
`docs/fixtures/snowflake_round_trip_v1.json`, and keeps provider/session/UI
state out of the canonical payload.

The real Snowflake fixture-oriented deliverable is a credential-free local
fixture path covering `ANALYTICS.CORE.CUSTOMER`,
`ANALYTICS.CORE.ORDER_HEADER`, primary keys on both tables, and
`ORDER_HEADER.CUSTOMER_ID` referencing `CUSTOMER.CUSTOMER_ID`. The playbook must
require the implementation to cover the v1 fixture type, nullability, default,
identifier, stable id, deterministic ordering, and forbidden-key rules already
recorded in `architecture.md` and the fixture files.

The concrete oracle is the value in
`docs/fixtures/snowflake_round_trip_v1.json`: `model_version` `"1"`, model name
`snowflake-round-trip-v1`, namespace `namespace:ANALYTICS.CORE`, table ids
`table:ANALYTICS.CORE.CUSTOMER` and
`table:ANALYTICS.CORE.ORDER_HEADER`, and relationship id
`relationship:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER`. The SQL
fixture exercises `NUMBER(38, 0)`, `NUMBER(12, 2)`, `VARCHAR(200)`,
`VARCHAR(500)`, `DATE`, `TIMESTAMP_NTZ(9)`, `BOOLEAN`, nullable and
non-nullable columns, `DEFAULT TRUE`, `DEFAULT CURRENT_TIMESTAMP()`, and
`DEFAULT 0`.

Acceptance check mapping:

| Contract acceptance check | Concrete playbook content | Deterministic validation | Smoke evidence | Review-verdict evidence |
| --- | --- | --- | --- | --- |
| Contract document contains exact headings `Overview`, `Problem`, `Constraints`, and `Acceptance Checks`. | Add a non-code validation step that checks `docs/governed-deterministic-check-playbook-contract.md` with line-anchored heading matching before authoring implementation code. | Use an anchored check equivalent to `rg -n '^## (Overview|Problem|Constraints|Acceptance Checks)$' docs/governed-deterministic-check-playbook-contract.md` plus a count check of exactly four level-two headings. | The smoke gate remains separate and does not replace this document-shape check. | The reviewer records the exact heading-check command and exit code in `checks_run`; any review finding should block if substring-only heading validation is used. |
| Contract defines the first Snowflake fixture-oriented governed slice around `docs/fixtures/snowflake_round_trip_v1.sql` and `docs/fixtures/snowflake_round_trip_v1.json`. | Add implementation tasks for a local fixture loader/translator, canonical serialization, and expected JSON comparison using those exact paths. | Include a pytest command for the fixture comparison, for example `PYTHONPATH=src python3 -m pytest tests/test_snowflake_fixture.py -q`, and require the test to fail if either fixture path is missing. | The user smoke still runs the existing app smoke; it proves the new slice did not break the pinned smoke surface. | `checks_run` includes the fixture pytest command and its observed exit code. The prose review confirms the implementation uses the canonical model rather than a durable provider-native graph. |
| Contract requires strict-load validation through real Agent-Orch `lint-playbook --strict --json` for `playbooks/snowflake-fixture-deterministic-check.yaml`. | Add a verification step before any launch handoff that runs the real Agent-Orch strict loader/linter on the authored playbook. | Required command: `python3 -m agent_orch.main lint-playbook --strict --json playbooks/snowflake-fixture-deterministic-check.yaml`, with any required import path made explicit by the worker environment. | Smoke cannot substitute for strict-load validation; the playbook must preserve both checks. | `checks_run` records the strict-lint command and exit code. Review blocks on generic YAML-only parsing, duplicate-key blind spots, misplaced `checks_run_match`, malformed step shape, or missing quality-floor gates. |
| Contract requires dry-run/prelaunch checks in review verdict `checks_run` and re-execution by `checks_run_match`. | The review gate must require a verdict JSON under `code-reviews/` whose `checks_run` contains only commands actually executed from the workspace before launch. | Dry-run commands must be non-mutating: strict playbook lint/load, fixture deterministic pytest, local test command for the implementation slice, and compile or equivalent syntax check for edited Python source and tests. | Dry-run checks do not launch a detached governed run and do not rewrite smoke artifacts. They complement, rather than replace, the later smoke gate. | The review validation uses `json_schema` with `builtin:review_verdict/v1`, `review_verdict_clean`, and system `checks_run_match` so listed commands and observed exit codes are rechecked. |
| Contract explicitly preserves the pinned user smoke gate and canonical review-verdict gate. | Keep a `smoke_runner` step pinned to `tests/smoke_manifest.json`, `tests/smoke_start.py`, and `scripts/smoke.py`; keep a separate review step that writes both prose and verdict artifacts under `code-reviews/`. | The smoke runner must execute the manifest commands, and review validation must enforce the verdict schema and cleanliness checks. | Expected smoke artifact: `artifacts/user-smoke/result.json` with `app_started: true`, `core_flow_completed: true`, zero start/check exit codes, and no blocking errors. | Expected review artifacts: `code-reviews/review-governed-deterministic-check-playbook.md` and `code-reviews/review-governed-deterministic-check-playbook.verdict.json` with a passing clean verdict and matched checks. |
| Contract prohibits live Snowflake credentials, network access, provider/session/UI fields in `PhysicalModel`, and unsupported product claims. | Add implementation instructions that forbid live Snowflake connection parameters and forbid diagram, project-storage workflow, DDL-generation, or full round-trip claims beyond the implemented deterministic fixture check. | Fixture tests must assert forbidden canonical JSON keys such as `account`, `warehouse`, `role`, `connection`, `session`, `canvas`, `nodes`, `edges`, `viewport`, `theme`, `selected`, and `history` are absent. | Smoke evidence should remain local and credential-free. No smoke step should ask for Snowflake env vars or network access. | Review must include an architecture-focused finding pass/fail decision on whether the implementation bypasses `PhysicalModel`, leaks provider/session/UI fields, or overclaims DDL/project/diagram capability. |

# Tests

The authored playbook should require the implementation slice to add or update
focused tests, with names chosen by the implementer but with this minimum test
coverage:

- Fixture presence and load: the SQL and JSON fixture files are read from
  `docs/fixtures/` and missing files fail the test.
- Fixture translation: SQL for `CUSTOMER` and `ORDER_HEADER` produces the
  expected canonical namespaces, tables, columns, constraints, and relationship.
- Deterministic serialization: the serialized model is JSON-compatible, stable
  across repeated runs, sorted by the canonical ordering rules, and equal to
  `docs/fixtures/snowflake_round_trip_v1.json` after `json.dumps()` and
  `json.loads()`.
- Strict-load behavior: malformed or unsupported fixture constructs fail loudly
  rather than being ignored or stored as provider extension blobs.
- Forbidden state: canonical JSON excludes provider/session/UI keys and
  machine-local values.
- Existing contracts: `tests/test_model.py` and
  `tests/test_project_serialization.py` continue to pass without weakening their
  strict-load expectations.

The local test command recorded by the playbook should be explicit. A suitable
minimum is:

```bash
PYTHONPATH=src python3 -m pytest tests/test_model.py tests/test_project_serialization.py tests/test_snowflake_fixture.py -q
```

The playbook may also include the full suite command:

```bash
PYTHONPATH=src python3 -m pytest tests -q
```

# Verification

The authored playbook must have a dedicated verification step before it can be
used for the later implementation run. The minimum verification bundle is:

```bash
python3 -m agent_orch.main lint-playbook --strict --json playbooks/snowflake-fixture-deterministic-check.yaml
PYTHONPATH=src python3 -m pytest tests/test_model.py tests/test_project_serialization.py tests/test_snowflake_fixture.py -q
python3 -m compileall src tests
```

If the worker needs a local Agent-Orch import path, the command should expose
that path in the step instructions instead of replacing strict loading with a
generic YAML parse. The strict-load command is the acceptance gate for duplicate
YAML keys, malformed step shapes, weak review verdict schema contracts,
misplaced `checks_run_match`, and missing smoke/review gates.

The smoke gate remains the pinned manifest-driven user smoke:

```bash
python3 tests/smoke_start.py
python3 scripts/smoke.py
```

Agent-Orch should run those commands through the `smoke_runner` using
`tests/smoke_manifest.json`, not through an ad hoc replacement. The expected
evidence is `artifacts/user-smoke/result.json` showing startup and core flow
success with zero start/check exit codes and no blocking errors.

The review gate must write:

- `code-reviews/review-governed-deterministic-check-playbook.md`
- `code-reviews/review-governed-deterministic-check-playbook.verdict.json`

The verdict must be validated with `json_schema` using
`builtin:review_verdict/v1`, `review_verdict_clean`, and system
`checks_run_match`. Its `checks_run` list must include real, re-executable,
non-mutating dry-run commands and the actual observed exit code for each:

- strict Agent-Orch playbook lint/load for
  `playbooks/snowflake-fixture-deterministic-check.yaml`
- deterministic fixture pytest proving the fixture-to-canonical-JSON check is
  present
- the local Python test command used by the implementation slice
- `python3 -m compileall src tests` or an equivalent syntax check for edited
  Python files

# Risks

- Agent-Orch may be importable only with a local path in some worker
  environments. The plan requires making that environment explicit while still
  running the real strict loader.
- A weak implementation could compare fixture text or generic dictionaries
  without strengthening `PhysicalModel`. The playbook and review must block this
  by requiring canonical model serialization evidence.
- The fixture parser could silently ignore unsupported Snowflake constructs.
  Tests must include fail-loud behavior for unsupported v1 inputs.
- Smoke and review gates could be accidentally weakened while adding the new
  implementation steps. The strict-lint and review-verdict checks must treat
  missing `smoke_runner`, missing verdict artifacts, or missing
  `checks_run_match` as blockers.
- The slice can be overclaimed. The deliverable is a deterministic local
  Snowflake fixture check only; diagram runtime dependencies, project storage
  workflows, live Snowflake connectivity, DDL generation, and full round-trip
  engineering remain out of scope unless separately implemented and reviewed.
