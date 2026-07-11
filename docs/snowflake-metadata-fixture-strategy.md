# Snowflake Metadata Fixture Strategy

Status: deterministic, offline-first strategy for Snowflake reverse-engineering
fixtures and the reusable canonical-model test seam.

This document defines how `erd-tool` captures representative Snowflake metadata
as local fixtures, encodes them stably, maps them into the canonical physical
model, and maintains those fixtures without live Snowflake credentials or
network access. It complements `docs/canonical-physical-model-v1-contract.md`,
`docs/project-serialization-smoke-contract.md`, and the seed fixtures under
`docs/fixtures/`. Fixtures are the executable contract for reverse-engineering
tests; they are not connection profiles, diagram documents, or provider-native
dumps that bypass the canonical model. This strategy does not implement a
translator, DDL generator, or live connector; it defines the offline inputs and
assertion seam those later slices must reuse.

## Fixture Scope

Fixtures cover the smallest Snowflake metadata surface that proves reverse
engineering into the canonical physical model without inventing unsupported
capability. The primary representative case is the v1 pair already checked in
as `docs/fixtures/snowflake_round_trip_v1.sql` and
`docs/fixtures/snowflake_round_trip_v1.json`: catalog `ANALYTICS`, schema
`CORE`, parent table `CUSTOMER`, child table `ORDER_HEADER`, and the foreign
key `ORDER_HEADER.CUSTOMER_ID` referencing `CUSTOMER.CUSTOMER_ID`.

Representative metadata cases that fixtures must encode include:

- One database/catalog and one schema in a single namespace.
- At least two permanent base tables in that namespace.
- One primary key on each table with an explicit constraint name.
- One foreign key from child to parent, also producing a derived relationship.
- Nullable and non-nullable columns in the same table.
- Type families limited to the v1 contract: `NUMBER(38, 0)`, `NUMBER` with
  nonzero scale such as `NUMBER(12, 2)`, `VARCHAR` with length, `DATE`,
  `TIMESTAMP_NTZ` with precision, and `BOOLEAN`.
- At least one default expression preserved as normalized SQL text.
- Optional table or column comments only when the implementation represents
  them in the canonical model.

Out of scope for these fixtures: live account, warehouse, role, session, or
credential fields; temporary, transient, external, hybrid, Iceberg, dynamic, or
view-like objects; cross-database or cross-schema relationships; case-sensitive
quoted identifiers; grants, policies, streams, tasks, stages, sequences, and
other Snowflake object types outside the v1 permanent-table slice. Unsupported
types and constructs must fail loudly in translation tests rather than degrade
into opaque strings or provider extension blobs. Diagram canvas state, node
coordinates, viewport, theme, and editor history must never appear in metadata
fixtures or in the canonical model payload they produce.

This strategy slice is limited to deterministic offline Snowflake metadata
inputs. It does not claim that a translator, DDL renderer, diagram runtime, or
project-storage UI already exists. Negative and boundary fixtures may be added
later as sibling files, but the first acceptance set stays positive and small so
every failure points at a specific modeling contract gap. Fixture scope grows
only when the canonical physical model contract is revised; fixtures must not
silently expand the product surface ahead of that contract.

## Fixture Format

Fixtures use a stable, dual-artifact encoding that keeps provider input and
canonical expectation separate while remaining fully offline. For each named
case, store a SQL metadata input beside an expected canonical JSON document
under `docs/fixtures/`, using deterministic filenames such as
`snowflake_round_trip_v1.sql` and `snowflake_round_trip_v1.json`. UTF-8 text,
LF line endings, and trailing newlines are required so diffs stay readable
across platforms. Implementation tests may copy or load these files from
`tests/fixtures/`, but copied content must remain semantically identical unless
the contract changes.

The SQL artifact is the reverse-engineering input. It must use unquoted
uppercase identifiers for v1, explicit constraint names, and only the supported
type render texts. Whitespace and statement wrapping may vary in generated DDL
later, but checked-in source fixtures should stay compact and human-editable.
The JSON artifact is the expected canonical physical model dictionary after
translation: `model_version`, `name`, `namespaces`, `tables`, and
`relationships`, with deterministic ids derived from containment paths
(`namespace:ANALYTICS.CORE`, `table:ANALYTICS.CORE.CUSTOMER`,
`column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID`, and similarly for constraints and
relationships). Object key order and list order must match the canonical
serialization rules: lists sorted by stable id except `Table.columns`, which
preserve one-based ordinal order.

Encoding rules that keep fixtures stable and offline-only:

- JSON-compatible values only: strings, numbers, booleans, `null`, lists, and
  objects; no timestamps, hostnames, filesystem paths, credentials, or
  machine-local fields.
- Forbidden keys in canonical JSON include `account`, `warehouse`, `role`,
  `connection`, `session`, `host`, `generated_at`, `canvas`, `nodes`, `edges`,
  `viewport`, `theme`, `selected`, `undo_history`, and `history`, matching the
  provider/UI exclusions already asserted by `tests/test_model.py` and
  `tests/test_project_serialization.py`.
- Type aliases such as `DECIMAL`, `NUMERIC`, `STRING`, or unparameterized
  `NUMBER`/`VARCHAR` are not part of the fixture contract; fixtures assert the
  explicit canonical forms only.
- `json.dumps()` followed by `json.loads()` on the expected JSON must preserve
  value equality; pretty-printing is allowed as presentation only.

When a later contract revision needs INFORMATION_SCHEMA-shaped rows instead of
DDL, store those as versioned JSON tables with the same case name and a
documented schema, still without credentials or network fetch. The test seam
loads fixtures from the repository path only, never from a live Snowflake
session.

## Canonical-Model Expectations

The reusable canonical-model test seam is the only accepted path from Snowflake
fixture input to assertions. It must reuse the same provider-neutral
serialization discipline already exercised by the seed tests: construct or load
a `PhysicalModel`, call `to_dict()` / `save_project_model()`, require
`json.loads(json.dumps(...))` value equality, and assert forbidden
provider/session/UI keys remain absent. Fixture tests extend that seam; they
must not invent a parallel Snowflake-native schema document or bypass
`PhysicalModel`.

Phased expectations keep the seam honest about current code:

1. Seed phase (implemented today): `tests/test_model.py` and
   `tests/test_project_serialization.py` prove `PhysicalModel(name=...)`,
   JSON-ready `to_dict()`, project envelope
   `{"project_version": "1", "physical_model": {"name": ...}}`, round-trip load
   via `load_project_model`, and rejection of malformed or unexpected fields.
   Seed tests must not claim Snowflake ingest capability.
2. Fixture-to-model phase (next implementation slice): load the SQL fixture,
   translate into the v1 `PhysicalModel` object graph, serialize with the
   canonical `to_dict()` path, and compare against the expected JSON fixture by
   decoded value equality. Project serialization continues to wrap the same
   `physical_model` dictionary; fixture tests assert model content, while
   project envelope tests continue to assert `project_version` separately.
3. Optional later acceptance: semantic DDL render and re-ingest equality, as
   described by the v1 contract. That step is not required to define or
   maintain the offline fixture inputs and is out of scope for claiming product
   readiness in this strategy document.

Required assertions for the representative v1 fixture case, once the translator
exists:

- Namespace `namespace:ANALYTICS.CORE` with catalog `ANALYTICS` and schema
  `CORE`.
- Tables `CUSTOMER` and `ORDER_HEADER` with kind `"table"`, correct
  `namespace_id`, and column ordinals matching fixture order.
- Primary keys `PK_CUSTOMER` and `PK_ORDER_HEADER` on the owning tables.
- Foreign key `FK_ORDER_HEADER_CUSTOMER` on `ORDER_HEADER` plus a derived
  relationship with cardinality `"many_to_one"` linking the same column ids.
- Data types match family, text, precision, scale, and length fields exactly
  for every column in the fixture.
- Nullability and default expression text survive serialization; nullable
  `NOTES` and defaults such as `TRUE`, `CURRENT_TIMESTAMP()`, and `0` remain
  distinct from omitted defaults (`null`).

Failures that invent unsupported Snowflake features, drop relationships,
reorder columns by id instead of ordinal, or inject session state into the
model are blocking contract defects, not cosmetic test noise.

## Validation and Maintenance

Fixture provenance is local and intentional. Checked-in fixtures are authored
from the canonical physical model v1 contract and architecture acceptance
checks, not scraped from production accounts. The SQL and JSON pair under
`docs/fixtures/` is the provenance record: the SQL states the intended
Snowflake DDL shape; the JSON states the intended canonical value. Commit
messages and AgentFlow notes should describe why a fixture changed (contract
revision, bug fix, or new representative case). Live warehouse queries are not
part of the maintenance workflow for this strategy; drafting stays offline
against the contract and the checked-in pair.

Updating fixtures without live Snowflake access is the default and only
supported workflow:

1. Edit the SQL metadata input to express the new representative case within
   the current contract.
2. Update or regenerate the expected canonical JSON by running the local
   translator against that input once the translator exists; until then, edit
   the JSON by hand against the contract and keep it consistent with the SQL.
3. Run offline gates: `PYTHONPATH=src python3 -m pytest tests -q` (including
   `tests/test_model.py` and `tests/test_project_serialization.py`), compile and
   lint checks, and any fixture-specific tests that load `docs/fixtures/`.
4. Confirm `json.loads` round-trip equality and that forbidden provider/UI keys
   remain absent from both the expected fixture JSON and any serialized model
   under test.
5. If the change expands object or type coverage, revise
   `docs/canonical-physical-model-v1-contract.md` and `architecture.md` in the
   same change set; do not widen fixtures alone.

Validation must never require network access, Snowflake credentials, or cloud
services. CI and Agent-Orch smoke gates load fixtures from the workspace only.
When a fixture becomes obsolete, remove or version-bump it explicitly rather
than leaving divergent SQL and JSON pairs. Scratch experiments belong under
`.agent-orch-scratch/` and must not be treated as governed fixture outputs.
Governed documentation for this strategy stays in `docs/`; fixture binaries or
large dumps are rejected in favor of small, reviewable text artifacts that
every acceptance failure can point to by path and field.
