# Sprint Plan

## Current sprint

- [x] Bootstrap a smokeable ERD tool workspace for auto-orch Author grounding.
- [x] Embed AgentFlow and Agent-Orch onboarding scaffold.
- [x] Complete one auto-orch -> Agent-Orch governed run.
- [x] Evaluate open-source foundations before adopting diagram or metadata
  dependencies.
- [x] Gate the foundation evaluation with user smoke and Agent-Orch review
  verdict.
- [ ] Review and commit useful governed outputs from runs `92f0f7950898`,
  `f5c992dbfae3`, `b280da16ca4a`, `e83567a7f4bc`, and `b29a5acdb7d2`.
- [ ] Run Agent-Orch doctor and resolve readiness findings.
- [ ] Carry forward the non-blocking foundation review findings before any
  dependency adoption: candidate release or commit anchors, drawDB AGPL v3
  network-use source obligations, and Mermaid browser-rendering security scope
  with a patched pinned version.
- [x] Create and review the executable canonical model test scaffold: canonical
  `PhysicalModel` import, provider-neutral name, JSON-ready serialization, and
  explicit guard against Snowflake/provider/UI keys.
- [ ] Carry forward scaffold review findings: reuse the CLI parser in the
  no-args path, add negative-path `PhysicalModel` name tests when validation is
  introduced, and replace the smoke helper global with `threading.Event` if the
  smoke process gains threads.
- [x] Repair and review the markdown heading validation template contract so
  generated playbook worker missions/retry messages carry exact required
  heading strings and minimum character counts before governed launch.
- [ ] Carry forward markdown heading validation review findings: add an
  importable guidance API or adjust the plan, record explicit smoke evidence or
  narrow the contract, and resolve the JSON content stored in a `.yaml` file.
- [x] Author and review the Snowflake metadata fixture strategy: offline
  SQL/JSON fixture pair contract, canonical-model expectations, and reusable
  `PhysicalModel` → `to_dict()` → `save_project_model()` test seam without
  claiming translator/DDL/diagram/live-connector capability.
- [ ] Carry forward fixture-strategy review findings: fix
  `ORDER_HEADER.constraints` sort order vs stable-id rule (or document
  kind-precedence), and stop classifying planned canonical `tables` /
  `relationships` keys as provider/UI exclusions in the seed test.
- [ ] Launch the next governed product slice: Snowflake metadata fixture to
  canonical model serialization. Keep it test-first and do not claim diagram,
  project storage, DDL generation, or full round-trip capability in that slice.
