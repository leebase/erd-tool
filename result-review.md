# Result Review

## 2026-07-10 - Open-source foundation restart handoff

### What Was Decided

Lee explicitly approved forking and using drawDB as the ERD editor foundation,
with ELK/elkjs as the layout foundation. The public GitHub fork
`leebase/drawdb` was created from upstream commit
`b24ad20b6588b9b99609e8a03b87efa7b28cf245`; elkjs is initially pinned to
`87f373f5697675f94de210f7d07170d7f2f97391`.

### Restart State

No product code was written after this decision. The earlier clean-room static
UI proposal was superseded in `docs/overnight-delivery-plan.md`. A fresh Sol
session should integrate the forked React application through adapters around
the canonical physical model, preserve drawDB's AGPL-3.0 obligations, and use
the documented Chinook SQLite database as the forward-engineering demo input.

## 2026-07-10 - Local Snowflake key-pair CLI access

### What Was Built

A dedicated RSA key pair was generated under the ignored local `.snowflake/`
directory, its public half was registered for Snowflake user `LEEBASE`, and a
named local Snowflake CLI connection, `erd-tool`, was configured with
key-pair/JWT authentication. The connection was verified with the actual CLI
as `LEEBASE` using `ACCOUNTADMIN`.

### Why It Matters

The project can now use a real Snowflake account for a future, explicitly
governed live-metadata connector slice without putting a password, private key,
or connection state in the repository or canonical model.

### How to Verify

```bash
cd /Users/lee/projects/erd-tool
snow connection test --connection erd-tool
snow sql --connection erd-tool --query \
  'select current_user(), current_role(), current_account()'
git check-ignore -v .snowflake/keys/erd-tool-leebase.p8
```

The local smoke and syntax checks pass. The isolated Python 3.14 test runtime
at `~/.venvs/erd-tool` has pytest installed; verify the full suite with:

```bash
~/.venvs/erd-tool/bin/python -m pytest tests -q
```

## 2026-07-10 - Snowflake metadata fixture strategy

### What Was Built

Agent-Orch run `b29a5acdb7d2`
(`create_snowflake_metadata_fixture_strategy`) authored and repaired
`docs/snowflake-metadata-fixture-strategy.md` as a deterministic offline-first
strategy for Snowflake reverse-engineering fixtures and the reusable
canonical-model test seam. The document covers fixture scope (ANALYTICS.CORE
CUSTOMER/ORDER_HEADER pair), dual SQL/JSON encoding under `docs/fixtures/`,
canonical-model expectations (`model_version`, namespaces, tables,
relationships, stable path-derived ids), and a phased validation/maintenance
workflow that reuses `PhysicalModel` → `to_dict()` → `save_project_model()`
without claiming a translator, DDL generator, diagram runtime, or live
connector.

### Why It Matters

This gives the next product slice an explicit offline contract so fixture-to-
model work can stay canonical-model-first and credential-free. The review
verdict is `pass`, but not spotless: Medium F-01 flags an
`ORDER_HEADER.constraints` sort-order mismatch versus the stated stable-id
rule, and Medium F-02 flags the seed test treating planned canonical keys
`tables` and `relationships` as forbidden provider/UI keys.

### How to Verify

```bash
python3 -m compileall tests
PYTHONPATH=src python3 -m pytest tests -q
PYTHONPATH=src python3 scripts/smoke.py
```

Review evidence:
`code-reviews/review-snowflake-metadata-fixture-strategy.md` and
`code-reviews/review-snowflake-metadata-fixture-strategy.verdict.json`
record a `pass` verdict with two Medium non-blocking findings. User smoke
`artifacts/user-smoke/result.json` records `app_started: true`,
`core_flow_completed: true`, `start_exit_code: 0`, `check_exit_code: 0`, and
no blocking errors.

## 2026-07-09 - Markdown heading validation template repair

### What Was Built

Agent-Orch run `e83567a7f4bc`
(`repair_markdown_heading_validation_template_contract`) repaired
`playbooks/templates/repair_before_review_feature_delivery.yaml` so generated
playbook missions and retry messages carry exact `markdown_headings_present`
heading strings and declared minimum character counts. The slice also added a
reusable `Markdown Heading Validation Guidance` block and changed the governed
Black check to `BLACK_NUM_WORKERS=1 python3 -m black --check src tests`.

### Why It Matters

This prevents a recurring governed-run failure where workers receive prose that
does not exactly match deterministic markdown-heading validators. The review
verdict is `pass`, but the result is not spotless: Medium F001 says the planned
importable Python guidance API was not delivered, Low F002 says smoke artifact
evidence for the contract acceptance check is incomplete, and Low F003 notes
the template has a `.yaml` extension while storing JSON.

### How to Verify

```bash
PYTHONPATH=src python3 -m pytest tests/test_markdown_heading_guidance.py -q
PYTHONPATH=src python3 -m pytest tests -q
python3 -m json.tool playbooks/templates/repair_before_review_feature_delivery.yaml
python3 -m agent_orch.main validate-playbook playbooks/templates/repair_before_review_feature_delivery.yaml
python3 -m agent_orch.main lint-playbook --strict playbooks/templates/repair_before_review_feature_delivery.yaml
python3 -m ruff check src tests
python3 -m compileall src tests
git diff --check -- playbooks/templates/repair_before_review_feature_delivery.yaml
```

Review evidence:
`code-reviews/review-markdown-heading-validation-template-contract.md` and
`code-reviews/review-markdown-heading-validation-template-contract.verdict.json`
record a `pass` verdict with one Medium and two Low non-blocking findings.

## Latest completed work

- Auto-orch launched Agent-Orch run `b29a5acdb7d2` for the Snowflake metadata
  fixture strategy. The run authored and repaired
  `docs/snowflake-metadata-fixture-strategy.md`, passed user smoke, and
  produced review artifacts with verdict `pass` and two Medium findings
  (constraint sort order; seed-test key classification).
- Bootstrapped the repository with a minimal Python package, canonical
  `PhysicalModel`, CLI smoke command, and pytest coverage.
- Added AgentFlow memory docs, Agent-Orch onboarding files, starter playbooks,
  and validated `codex_cli/gpt-5.5` plus `claude_code/sonnet` pairings for
  governed execution.
- Auto-orch launched Agent-Orch run `92f0f7950898`, which completed
  successfully and produced strict-lint repair, smoke evidence, and review
  artifacts.
- Auto-orch launched Agent-Orch run `f5c992dbfae3` for open-source foundation
  evaluation. The run recorded adoption decisions in `architecture.md`, passed
  the user smoke gate, and produced review artifacts for the foundation
  decisions.
- Foundation evaluation outcome: drawDB remains a deferred product and
  interaction reference pending AGPL approval; `snowflake-dbml-generator` is
  avoided until provenance and license are verified; Graphviz is deferred to
  optional export/documentation/batch-layout use; ELK/elkjs is the preferred
  first browser layout-spike candidate pending human approval; Mermaid is
  deferred to documentation/export workflows.
- Foundation review verdict: `pass`, with only Low non-blocking findings:
  F001 asks for version or commit anchors before adoption decisions rely on a
  candidate; F002 asks future reviewers to distinguish AGPL network-use
  obligations from distribution triggers for drawDB; F003 asks any Mermaid
  browser-rendering slice to treat security review as required even for
  canonically generated input.
- Auto-orch launched Agent-Orch run `b280da16ca4a` for the executable model
  test scaffold. The run authored `tests/test_model.py` as a focused executable
  contract for the seed `PhysicalModel`, verified the minimal scaffold, passed
  user smoke, and produced review artifacts.
- Auto-orch launched Agent-Orch run `e83567a7f4bc` for the markdown heading
  validation template contract. The run repaired the feature-delivery playbook
  template, passed verification and user smoke, and produced review artifacts.
- Scaffold outcome: `PhysicalModel` remains a tiny frozen dataclass with a
  `name` field and `to_dict() -> {"name": name}`. The package now exports
  `PhysicalModel` from `src/erd_tool/__init__.py`. The tests assert canonical
  module import, stable provider-neutral name, JSON-ready serialization, and no
  Snowflake/provider/UI keys in the serialized seed model.
- Scope boundary: the scaffold is not Snowflake reverse engineering, diagram
  rendering/editing, project storage, Snowflake DDL generation, or round-trip
  engineering.
- Scaffold review verdict: `pass`, with only Low non-blocking findings:
  F001 redundant `build_parser()` construction in the CLI no-args path; F002 no
  negative-path model-name validation tests yet; F003 the single-threaded smoke
  start helper uses a module-level `_running` flag that should become
  `threading.Event` if threads are introduced.
- Markdown heading validation review verdict: `pass`, with non-blocking
  findings that still need follow-up. F001 is Medium and says the planned
  importable Python guidance API was not delivered. F002 is Low and says the
  smoke artifact evidence does not fully satisfy the written contract. F003 is
  Low and flags the `.yaml` extension on JSON-formatted template content.

## Verification

- `PYTHONPATH=src python3 scripts/smoke.py`
- `PYTHONPATH=src python3 -m pytest tests -q`
- Agent-Orch run `92f0f7950898`: `COMPLETED`.
- Agent-Orch run `f5c992dbfae3`: foundation evaluation, user smoke, and review
  steps passed; closeout handoff docs were repaired after a validator retry on
  `context.md` headings.
- `artifacts/user-smoke/result.json`: `app_started: true`,
  `core_flow_completed: true`, `start_exit_code: 0`, `check_exit_code: 0`, no
  blocking errors, completed 2026-07-08T14:51:20Z.
- `python3 -m compileall src tests` exited 0 during the foundation review.
- `code-reviews/review-open-source-foundations.verdict.json`: `pass`.
- Agent-Orch run `b280da16ca4a`: `COMPLETED`.
- Scaffold worker verification:
  `PYTHONPATH=src python3 -m pytest tests/test_model.py -q`,
  `PYTHONPATH=src python3 -m pytest tests -q`,
  `python3 -m compileall src tests`, `PYTHONPATH=src python3 scripts/smoke.py`,
  and `git diff --check -- src/erd_tool/model.py src/erd_tool/__init__.py
  tests/test_model.py`.
- Scaffold smoke: `artifacts/user-smoke/result.json` records
  `app_started: true`, `core_flow_completed: true`, `start_exit_code: 0`,
  `check_exit_code: 0`, no blocking errors, started
  2026-07-08T22:17:17Z and completed 2026-07-08T22:17:20Z.
- Scaffold review check: `python3 -m compileall src tests` exited 0; review
  notes also record `python3 -m pytest tests/test_model.py -v` as 3 passed.
- `code-reviews/review-model-test-scaffold.verdict.json`: `pass`.
- Agent-Orch run `e83567a7f4bc`: steps 1-4 passed and closeout handoff is the
  active step.
- Markdown heading repair worker verification:
  `PYTHONPATH=src python3 -m pytest tests/test_markdown_heading_guidance.py -q`,
  `PYTHONPATH=src python3 -m pytest tests -q`,
  `python3 -m json.tool playbooks/templates/repair_before_review_feature_delivery.yaml`,
  `python3 -m agent_orch.main validate-playbook playbooks/templates/repair_before_review_feature_delivery.yaml`,
  `python3 -m agent_orch.main lint-playbook --strict playbooks/templates/repair_before_review_feature_delivery.yaml`,
  `python3 -m ruff check src tests`, `python3 -m compileall src tests`, and
  `git diff --check -- playbooks/templates/repair_before_review_feature_delivery.yaml`.
- Latest smoke result: `artifacts/user-smoke/result.json` records
  `app_started: true`, `core_flow_completed: true`, `start_exit_code: 0`,
  `check_exit_code: 0`, and no blocking errors for run `e83567a7f4bc`.
- `code-reviews/review-markdown-heading-validation-template-contract.verdict.json`:
  `pass`.
- Agent-Orch run `b29a5acdb7d2`: steps 1-4 passed and closeout handoff is the
  active step.
- Fixture strategy worker outputs: `docs/snowflake-metadata-fixture-strategy.md`
  (author + repair under `docs/`); review wrote
  `code-reviews/review-snowflake-metadata-fixture-strategy.md` and
  `code-reviews/review-snowflake-metadata-fixture-strategy.verdict.json`.
- Fixture strategy review check: `python3 -m compileall tests` exited 0; all
  four test files compiled cleanly.
- Fixture strategy smoke: `artifacts/user-smoke/result.json` records
  `app_started: true`, `core_flow_completed: true`, `start_exit_code: 0`,
  `check_exit_code: 0`, and no blocking errors for run `b29a5acdb7d2`.
- `code-reviews/review-snowflake-metadata-fixture-strategy.verdict.json`:
  `pass` (Medium F-01 constraint sort order; Medium F-02 seed-test
  `tables`/`relationships` classification).
