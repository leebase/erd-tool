# Context

## Snapshot

- Mode: 2
- Operating model: AgentFlow memory plus governed Agent-Orch execution launched
  by the `erd-tool` auto-orch mission.
- Current focus: Build a Snowflake-focused database modeling studio with a
  canonical physical model at the center.
- Current baseline: committed Python seed package with `PhysicalModel`,
  installed-independent CLI smoke command, pytest coverage, strict-lint repair
  artifacts from run `92f0f7950898`, open-source foundation evaluation
  artifacts from run `f5c992dbfae3`, executable model scaffold output from run
  `b280da16ca4a`, markdown-heading validation template repair from run
  `e83567a7f4bc`, and Snowflake metadata fixture strategy from run
  `b29a5acdb7d2`.
- Local operator access: the `erd-tool` Snowflake CLI profile now uses a
  dedicated RSA key pair for `LEEBASE` with `ACCOUNTADMIN`; private material is
  machine-local under ignored `.snowflake/`, and a real read-only CLI identity
  query passed on 2026-07-10.
- Latest governed run:
  `/home/lee/projects/erd-tool-agent-orch-runs/b29a5acdb7d2`
  (`create_snowflake_metadata_fixture_strategy`) is in closeout handoff after
  PASS gates for strategy authoring, repair/verify, user smoke, and review.
- Latest dashboard:
  `/home/lee/projects/erd-tool-agent-orch-runs/b29a5acdb7d2/dashboard.html`.
- Latest strategy slice: `docs/snowflake-metadata-fixture-strategy.md` defines
  deterministic offline Snowflake metadata fixtures, dual SQL/JSON encoding,
  canonical-model expectations, and a phased validation seam that reuses
  `PhysicalModel` → `to_dict()` → `save_project_model()` without claiming a
  translator, DDL generator, diagram runtime, or live connector yet.
- Supporting fixtures already present: `docs/fixtures/snowflake_round_trip_v1.sql`
  and `docs/fixtures/snowflake_round_trip_v1.json` (catalog `ANALYTICS`, schema
  `CORE`, `CUSTOMER` / `ORDER_HEADER`, PK/FK, six v1 type families).
- Latest review verdict:
  `code-reviews/review-snowflake-metadata-fixture-strategy.verdict.json` is
  `pass`, but not spotless. Medium F-01: `ORDER_HEADER.constraints` lists PK
  before FK, contradicting lexicographic stable-id sort. Medium F-02: seed
  `tests/test_model.py` treats planned canonical keys `tables` and
  `relationships` as forbidden provider/UI keys, creating a Phase 2 trap.
- Prior template repair slice remains useful infrastructure:
  `playbooks/templates/repair_before_review_feature_delivery.yaml` carries
  reusable markdown-heading guidance; its review still has Medium F001 for the
  missing importable guidance API plus Low F002/F003 smoke-evidence and
  JSON-vs-YAML naming follow-ups.
- Completed scaffold slice: `tests/test_model.py` remains the executable seed
  contract for import path, provider-neutral name, JSON-ready serialization,
  and absence of true provider/session/UI keys. `PhysicalModel` stays a tiny
  frozen dataclass; fixture-to-model translation is not implemented yet.
- Scope boundary: this strategy does not implement Snowflake metadata ingest,
  diagrams, project file storage UI, DDL generation, or round-trip engineering.
- Completed foundation decision: `architecture.md` records the 2026-07-08
  open-source foundation evaluation (drawDB reference-only pending AGPL;
  avoid unverified `snowflake-dbml-generator`; defer Graphviz/Mermaid to
  export/docs; prefer ELK/elkjs for a later browser layout spike).
- Smoke evidence for this strategy run: `artifacts/user-smoke/result.json`
  records `app_started: true`, `core_flow_completed: true`,
  `start_exit_code: 0`, `check_exit_code: 0`, and no blocking errors.
- Review check for this strategy run: `python3 -m compileall tests` exited 0
  (four test files compile cleanly).

## What's Happening Now

- Next action: finish closeout for run `b29a5acdb7d2`, then review and commit
  useful governed outputs from runs `92f0f7950898`, `f5c992dbfae3`,
  `b280da16ca4a`, `e83567a7f4bc`, and `b29a5acdb7d2`; after that, run
  Agent-Orch doctor.
- Carry the latest fixture-strategy review findings forward before treating the
  strategy as implementation-ready: reorder `ORDER_HEADER.constraints` to
  lexicographic stable-id order (or document kind-precedence sort), and split
  seed-test forbidden keys so `tables` / `relationships` are not treated as
  provider/UI exclusions when Phase 2 expands `PhysicalModel`.
- Recommended next product slice: launch a governed fixture-to-model
  implementation that loads the offline SQL/JSON pair into an expanded
  canonical physical model and asserts stable serialization through the existing
  project-serialization seam. Stay test-first; do not add a diagram runtime or
  claim DDL/round-trip support in that slice.
- Local test-runtime note: pytest is installed in the isolated Python 3.14
  environment at `~/.venvs/erd-tool`. Use
  `~/.venvs/erd-tool/bin/python -m pytest tests -q` for future local checks;
  the system Python remains unchanged.
- Carry earlier non-blocking findings forward in parallel where they block
  infrastructure or adoption: markdown-heading importable guidance API (Medium),
  template smoke-evidence/JSON-vs-YAML naming (Low), scaffold CLI parser reuse
  and smoke `threading.Event` hygiene (Low), and foundation version-anchor /
  drawDB AGPL network-use / Mermaid security follow-ups before any dependency
  adoption.
