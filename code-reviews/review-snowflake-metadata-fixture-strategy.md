# Review: Snowflake Metadata Fixture Strategy

**Document reviewed:** `docs/snowflake-metadata-fixture-strategy.md`
**Supporting artifacts:** `docs/fixtures/snowflake_round_trip_v1.sql`,
`docs/fixtures/snowflake_round_trip_v1.json`,
`docs/canonical-physical-model-v1-contract.md`,
`tests/test_model.py`, `tests/test_project_serialization.py`,
`src/erd_tool/model.py`, `src/erd_tool/project_serialization.py`

## Checks Run

Exactly one deterministic offline check was run as specified:

```
python3 -m compileall tests
```

Exit code: **0**. All four test files compiled without error:
`tests/smoke_start.py`, `tests/test_markdown_heading_guidance.py`,
`tests/test_model.py`, `tests/test_project_serialization.py`.
No syntax errors or import-time failures were detected in the test suite.

## Lens Notes

### fixture-integrity

The SQL and JSON pair is internally consistent and matches the v1 contract
recommendation: catalog `ANALYTICS`, schema `CORE`, tables `CUSTOMER` and
`ORDER_HEADER`, primary keys on both, and foreign key
`FK_ORDER_HEADER_CUSTOMER` with a derived `many_to_one` relationship. All six
required type families are present — `NUMBER(38,0)`, `NUMBER(12,2)`, `VARCHAR`,
`DATE`, `TIMESTAMP_NTZ(9)`, `BOOLEAN`. Nullable vs. non-nullable columns are
distinguished (`NOTES` nullable, all others not). Default expression text
survives as `"TRUE"`, `"CURRENT_TIMESTAMP()"`, and `"0"` for the three cases
that have defaults, while the remaining columns carry `null`, preserving the
distinction between omitted and explicit defaults. No forbidden keys
(`account`, `canvas`, `session`, etc.) appear in the JSON.

**Finding F-01 (Medium):** The `constraints` list on `ORDER_HEADER` in the
fixture JSON places `PK_ORDER_HEADER` before `FK_ORDER_HEADER_CUSTOMER`. The
strategy states "lists sorted by stable id." Lexicographic comparison of the
full id strings confirms `constraint:...FK_ORDER_HEADER_CUSTOMER` sorts before
`constraint:...PK_ORDER_HEADER` (F < P). A translator that faithfully sorts
by stable id will emit FK before PK and fail value-equality against the current
fixture. Either reorder the constraints in the JSON, or explicitly document
that constraints use a kind-first ordering (PK before FK) rather than id-string
order.

### strategy-coherence

The phased model (seed phase → fixture-to-model phase → optional DDL round-trip)
is clearly articulated and honest about what current code delivers vs. what
is deferred. The offline-only maintenance workflow (edit SQL, hand-author JSON,
run `pytest`, check `json.loads` round-trip) is complete and actionable. The
forbidden-key lists in the strategy are consistent with the corresponding sets
in `test_model.py` and `test_project_serialization.py`. The strategy correctly
treats the fixture JSON as the expected `to_dict()` payload after the
translator exists, not a claim that the translator already works.

**Finding F-02 (Medium):** `tests/test_model.py` (lines 18-32) includes
`"tables"` and `"relationships"` in `provider_or_ui_keys` — the set the test
asserts is disjoint from `to_dict()` output. Both keys are planned canonical
model fields required by the v1 contract and present in the fixture JSON; they
are not provider, session, or UI fields. When Phase 2 expands `PhysicalModel`
to carry tables and relationships, `to_dict()` will include those keys and the
seed test will fail incorrectly, even for a correct implementation. The
strategy does not flag this as a maintenance obligation that must be addressed
when moving from seed to fixture phase. The proposed fix is to separate the
"provider/session/UI keys must be absent" assertion from "these fields are not
yet implemented," so the seed test can be updated without implying the fields
are illegitimate.

### test-seam

The canonical-model test seam is sound. Both fixture phase and seed phase
tests share the same `PhysicalModel` → `to_dict()` → `save_project_model()`
path. The `test_project_serialization.py` forbidden-key set is more complete
than the `test_model.py` set and correctly includes `connection`, `session`,
`generated_at`, `host`, and `undo_history`. The strategy correctly requires
fixture tests to extend this seam rather than inventing a parallel
Snowflake-native schema document. The `load_project_model` round-trip tests
and the malformed-data rejection parametrize adequately for the seed phase.
No issues found in the test seam design.

### offline-determinism

All fixture content is composed of JSON-compatible primitive values only. No
timestamps, hostnames, filesystem paths, account names, warehouses, roles, or
machine-local values appear in either fixture file. Object ids are
deterministically derived from namespace, table, column, constraint, and
relationship names via the `prefix:CATALOG.SCHEMA.OBJECT` pattern, which is
stable across runs and platforms. The `json.dumps()` / `json.loads()` round-trip
rule is stated and verifiable without network access. The validation workflow
and CI gate described in the strategy are offline throughout. No issues found
in the offline-determinism design.
