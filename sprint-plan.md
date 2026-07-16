# Sprint Plan

## Open-source macOS release — 2026-07-15

- [x] Consolidate the completed Electron application into `desktop/`.
- [x] Preserve drawDB AGPL attribution, full license, patch history, and elkjs
  third-party notice.
- [x] Add a root MIT license for original canonical Python tooling and document
  the exact multi-license boundary.
- [x] Add public README, changelog, security policy, contribution guide, code of
  conduct, issue template, and pull request template.
- [x] Add Python/desktop CI, dependency updates, and an unsigned Apple Silicon
  packaging workflow.
- [x] Remove machine-specific paths and obsolete two-repository launch steps
  from release documentation.
- [x] Pass 119 Python tests, 115 desktop tests, lint/build gates, production
  audit, ARM64 package creation, and packaged-app smoke launch.
- [ ] Merge the release pull request after final owner review.

## Current sprint

- [x] Bootstrap a smokeable ERD tool workspace for auto-orch Author grounding.
- [x] Embed AgentFlow and Agent-Orch onboarding scaffold.
- [x] Complete one auto-orch -> Agent-Orch governed run.
- [x] Evaluate open-source foundations before adopting diagram or metadata
  dependencies.
- [x] Gate the foundation evaluation with user smoke and Agent-Orch review
  verdict.
- [x] Configure and verify local Snowflake CLI key-pair access for the
  `erd-tool` operator connection while keeping `.snowflake/` untracked.
- [x] Approve and create the `leebase/drawdb` open-source editor fork; the
  next implementation slice must integrate it with the canonical model and
  elkjs layout adapter rather than build a replacement editor.
- [x] Review and retain useful governed outputs from runs `92f0f7950898`,
  `f5c992dbfae3`, `b280da16ca4a`, `e83567a7f4bc`, and `b29a5acdb7d2`.
- [x] Run Agent-Orch doctor and resolve readiness findings (ready on 2026-07-11).
- [x] Close the non-blocking foundation review findings before dependency
  dependency adoption: candidate release or commit anchors, drawDB AGPL v3
  network-use source obligations, and Mermaid browser-rendering security scope
  with a patched pinned version.
- [x] Create and review the executable canonical model test scaffold: canonical
  `PhysicalModel` import, provider-neutral name, JSON-ready serialization, and
  explicit guard against Snowflake/provider/UI keys.
- [x] Close scaffold review findings: reuse the CLI parser in the
  no-args path, add negative-path `PhysicalModel` name tests when validation is
  introduced, and replace the smoke helper global with `threading.Event` if the
  smoke process gains threads.
- [x] Repair and review the markdown heading validation template contract so
  generated playbook worker missions/retry messages carry exact required
  heading strings and minimum character counts before governed launch.
- [x] Close markdown heading validation review findings: add an
  importable guidance API or adjust the plan, record explicit smoke evidence or
  narrow the contract, and resolve the JSON content stored in a `.yaml` file.
- [x] Author and review the Snowflake metadata fixture strategy: offline
  SQL/JSON fixture pair contract, canonical-model expectations, and reusable
  `PhysicalModel` → `to_dict()` → `save_project_model()` test seam without
  claiming translator/DDL/diagram/live-connector capability.
- [x] Close fixture-strategy review findings: fix
  `ORDER_HEADER.constraints` sort order vs stable-id rule (or document
  kind-precedence), and stop classifying planned canonical `tables` /
  `relationships` keys as provider/UI exclusions in the seed test.
- [x] Supersede the narrow next governed slice with the explicitly authorized,
  test-first working-application delivery below, including canonical fixture
  serialization and the assembled round-trip capability.

## Delivery sprint — working ERD application

- [x] Audit the approved `leebase/drawdb` fork at upstream pin
  `b24ad20b6588b9b99609e8a03b87efa7b28cf245` and record the two-repository
  integration contract.
- [x] Expand and validate canonical physical model v1; close the fixture order
  and forbidden-key review findings.
- [x] Implement constrained Snowflake DDL import/rendering and prove semantic
  fixture round trips.
- [x] Implement offline SQLite introspection and a Chinook-compatible CLI flow.
- [x] Extend project save/load with separate diagram layout and strict
  credential/session exclusion.
- [x] Add CLI import, render, project, and local browser-serving commands.
- [x] Extend the drawDB fork with canonical project adapters, Snowflake support,
  pinned elkjs auto-layout, and focused automated tests.
- [x] Build and smoke the real browser workflow, including edit, layout,
  save/reload, and generated DDL.
- [x] Run the real Snowflake key-pair identity check and scan both repositories
  for credential leakage.
- [x] Run the high-value live demonstration: reverse engineer the Chinook
  SQLite structure, forward engineer legal mapped tables into Snowflake,
  verify table/column/informational PK/FK metadata through Information Schema,
  and open the resulting canonical ER model. Data movement is optional.
- [x] Obtain independent `gpt-5.6-terra-high` code review and repair all
  findings, then update AgentFlow handoff documents.
- [x] Commit and push verified changes in both repositories (`erd-tool`
  `d88dc51`; drawDB `7601f6a`, followed by this closeout handoff).
