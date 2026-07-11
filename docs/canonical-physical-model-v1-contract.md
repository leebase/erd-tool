# Canonical Physical Model v1 Contract

Status: focused contract for the
`canonical_physical_model_v1_snowflake_round_trip` governed slice.

This document defines the first durable model contract for `erd-tool`. The
canonical physical model is the source of truth for provider ingest, project
files, diagram projections, and Snowflake DDL generation. Snowflake-specific
logic may feed or render this model, but must not replace it with a provider
native object graph.

## Overview

The v1 contract establishes the smallest Snowflake-focused physical model that
can support deterministic project files and round-trip engineering evidence. It
defines the canonical objects, the local Snowflake fixture shape, the JSON
stability rules, and the acceptance checks that future implementation slices
must satisfy before broader UI or provider work depends on the model.

## Goals

- Represent a small but real physical relational schema with stable, JSON-ready
  objects.
- Preserve the Snowflake metadata needed for an initial SQL fixture round trip.
- Keep diagram, UI layout, connection, role, warehouse, and runtime execution
  state outside the canonical model.
- Establish deterministic serialization so project files and tests can detect
  meaningful model changes.
- Support semantic DDL round trip checks for the v1 Snowflake fixture.

## Non-Goals

- No live Snowflake connectivity.
- No Snowflake account, warehouse, role, grant, policy, stream, task, pipe,
  masking, row access, tag, stage, file format, sequence, view, materialized
  view, dynamic table, hybrid table, external table, or stored procedure model.
- No diagram coordinates, canvas nodes, theme, viewport, selection, or editor
  history.
- No guarantee that generated DDL is byte-for-byte identical to source DDL.
- No implementation of every Snowflake data type or constraint capability.

## Canonical Model Scope

The canonical model scope is deliberately narrower than the full product
vision. It covers provider-neutral physical database objects that must survive
ingest, serialization, DDL rendering, and a second ingest pass without adding
connection state, diagram state, UI state, or provider-native escape hatches.

## Canonical Objects

### `PhysicalModel`

The root canonical object.

Required fields:

- `model_version`: string, exactly `"1"` for this contract.
- `name`: stable human-readable model name.
- `namespaces`: ordered list of `Namespace` objects.
- `tables`: ordered list of `Table` objects.
- `relationships`: ordered list of `Relationship` objects.

Rules:

- The root object is provider-neutral. It must not contain Snowflake account,
  warehouse, role, connection, or session fields.
- Serialization order is deterministic: namespaces first, then tables, then
  relationships.
- Lists are sorted by stable identifier unless a field explicitly uses ordinal
  order.

### `Namespace`

A logical physical container for tables.

Required fields:

- `id`: stable identifier.
- `catalog`: required legal Snowflake database/catalog identifier.
- `schema`: required legal Snowflake schema identifier.

Rules:

- `catalog` is the Snowflake database and `schema` is the Snowflake schema.
- Multiple namespaces and qualified cross-schema relationships are supported.
- Unquoted Snowflake identifiers are normalized to uppercase.
- Quoted identifiers are out of scope for v1 and should be rejected by the
  fixture parser or left unimplemented until a later contract revision.

### `Table`

A physical table-like relation in a namespace.

Required fields:

- `id`: stable identifier.
- `namespace_id`: id of the containing `Namespace`.
- `name`: table name.
- `kind`: exactly `"table"` for v1.
- `columns`: ordinal list of `Column` objects.
- `constraints`: ordered list of `TableConstraint` objects.
- `comment`: string or `null`.

Rules:

- Table ids are stable across parse, serialize, and render cycles for the same
  namespace and table name.
- V1 supports Snowflake permanent base tables only. Temporary, transient,
  external, hybrid, dynamic, and Iceberg tables are out of scope.

### `Column`

A physical column on a table.

Required fields:

- `id`: stable identifier scoped by table and column name.
- `name`: column name.
- `ordinal`: one-based integer preserving table column order.
- `data_type`: `DataType` object.
- `nullable`: boolean.
- `default`: SQL expression string or `null`.
- `comment`: string or `null`.

Rules:

- Column order is semantic and must be preserved.
- `nullable: false` renders as `NOT NULL`.
- Default expressions are preserved as normalized SQL text; the v1 contract does
  not require expression parsing beyond stable text round trip.

### `DataType`

A normalized physical SQL type.

Required fields:

- `family`: uppercase type family.
- `text`: normalized SQL type text.
- `precision`: integer or `null`.
- `scale`: integer or `null`.
- `length`: integer or `null`.

Snowflake v1 fixture families:

- `NUMBER`
- `VARCHAR`
- `DATE`
- `TIMESTAMP_NTZ`
- `BOOLEAN`

Rules:

- `text` is the canonical render text used by Snowflake DDL generation.
- Precision, scale, and length are populated when present in the SQL type text.
- Unsupported Snowflake types should fail loudly in v1 fixture parsing instead
  of silently degrading to strings.

### `TableConstraint`

A physical table-level constraint.

Required fields:

- `id`: stable identifier scoped by table and constraint name or generated role.
- `name`: constraint name or `null`.
- `kind`: `"primary_key"`, `"unique"`, or `"foreign_key"`.
- `columns`: ordered list of local column ids.
- `referenced_table_id`: table id for foreign keys, otherwise `null`.
- `referenced_columns`: ordered list of referenced column ids for foreign keys,
  otherwise empty.

Rules:

- Primary key and unique constraints are represented on the owning table.
- Foreign key constraints also produce a `Relationship`.
- Snowflake enforcement details are out of scope except that declared
  constraints must be preserved as metadata. Tests must not assume Snowflake
  enforces primary key, unique, or foreign key constraints.

### `Relationship`

The canonical relationship projection used by future diagrams and documentation.

Required fields:

- `id`: stable identifier.
- `name`: foreign key constraint name or generated relationship name.
- `source_table_id`: table containing the foreign key columns.
- `source_column_ids`: ordered foreign key column ids.
- `target_table_id`: referenced table.
- `target_column_ids`: ordered referenced column ids.
- `cardinality`: exactly `"many_to_one"` for v1 foreign keys.

Rules:

- Relationships are derived from foreign key constraints and must not duplicate
  unrelated UI edge state.
- Relationship ids are stable across SQL -> model -> JSON -> model cycles.

## Snowflake-Specific Scope

The Snowflake v1 fixture is intentionally small. It must cover:

- One database/catalog and one schema.
- At least two permanent tables in the same namespace.
- One primary key on each table.
- One foreign key from the child table to the parent table.
- Nullable and non-nullable columns.
- `NUMBER` with precision and scale.
- `VARCHAR` with length.
- `DATE`.
- `TIMESTAMP_NTZ` with precision.
- `BOOLEAN`.
- At least one default expression.
- Optional table or column comments when represented by the implementation.

The fixture must not require:

- Live Snowflake credentials.
- Network access.
- Case-sensitive quoted identifiers.
- Cross-database or cross-schema relationships.
- Snowflake DDL features outside the canonical object list above.

Recommended fixture shape:

- Namespace: catalog `ANALYTICS`, schema `CORE`.
- Parent table: `CUSTOMER`.
- Child table: `ORDER_HEADER`.
- Relationship: `ORDER_HEADER.CUSTOMER_ID` references `CUSTOMER.CUSTOMER_ID`.

## Snowflake Round Trip Fixture

The Snowflake round trip fixture is the local proof artifact for this contract.
It must be small, deterministic, credential-free, and specific enough to expose
loss of namespaces, tables, columns, data types, constraints, relationships,
nullability, defaults, or comments during SQL to model to DDL conversion.

## Round-Trip Fixture Files

The documentation fixture lives under `docs/fixtures/` until implementation
copies or adapts it into test fixtures.

Required files:

- `docs/fixtures/snowflake_round_trip_v1.sql`: source Snowflake DDL.
- `docs/fixtures/snowflake_round_trip_v1.json`: expected canonical JSON.

Fixture rules:

- The SQL and JSON files are part of this contract, not sample-only prose.
- The JSON fixture must be the expected `to_dict()` payload for the SQL fixture.
- Implementation tests may copy the files into `tests/fixtures/`, but the copied
  content must remain semantically identical unless this contract changes.

## DDL Round-Trip Expectations

The v1 round trip is semantic, not byte-for-byte textual preservation.

Required flow:

1. Load `docs/fixtures/snowflake_round_trip_v1.sql`.
2. Parse or translate it into `PhysicalModel`.
3. Serialize the model to JSON-compatible dictionaries.
4. Compare against `docs/fixtures/snowflake_round_trip_v1.json`.
5. Render Snowflake DDL from the canonical model.
6. Parse or translate the rendered DDL back into `PhysicalModel`.
7. Assert the second model serializes identically to the first model.

DDL generation rules:

- Emit deterministic object order: namespace setup, parent tables, child tables,
  then foreign key constraints when separate statements are needed.
- Render unquoted uppercase identifiers for v1.
- Render canonical type `text` exactly.
- Preserve column order, nullability, default expression text, comments when
  implemented, primary keys, unique constraints, and foreign keys.
- Prefer stable, explicit constraint names in fixture DDL.

Allowed differences from source SQL:

- Whitespace and line wrapping.
- Constraint placement inline versus table-level, as long as the re-parsed
  canonical model is identical.
- Optional `CREATE SCHEMA` or `USE` statements, if the canonical namespace still
  round trips correctly.

Rejected differences:

- Lost tables, columns, relationships, constraints, nullability, defaults, type
  precision/scale/length, or namespace information.
- Generated provider/session fields inside the canonical JSON.
- Diagram or UI keys inside the canonical JSON.

## JSON And Project-File Stability

The canonical JSON representation is the v1 project-file payload for model
state. Later project files may wrap it with diagram and editor state, but that
state must remain outside `PhysicalModel`.

Stability requirements:

- JSON serialization is deterministic across Python runs.
- Keys are emitted in a stable documented order.
- Object ids are deterministic from canonical names and containment, not random
  UUIDs.
- No timestamps, file paths, connection strings, Snowflake account names,
  warehouses, roles, or machine-local values appear in the model payload.
- Round-tripping through `json.dumps()` and `json.loads()` preserves equality.
- Adding optional fields in later versions requires a model version bump or a
  documented backwards-compatible default.

Forbidden canonical JSON keys in v1:

- `account`
- `warehouse`
- `role`
- `connection`
- `session`
- `canvas`
- `nodes`
- `edges`
- `viewport`
- `theme`
- `selected`
- `history`

## Acceptance Checks

This contract is satisfied when the governed slice can demonstrate all of the
following:

- `docs/canonical-physical-model-v1-contract.md` exists and defines canonical
  objects, Snowflake scope, DDL round-trip expectations, JSON/project-file
  stability, and acceptance checks.
- `docs/fixtures/snowflake_round_trip_v1.sql` and
  `docs/fixtures/snowflake_round_trip_v1.json` exist and match this contract.
- `tests/test_canonical_model_v1.py` asserts the canonical object surface and
  deterministic JSON-ready serialization.
- The fixture covers `CUSTOMER`, `ORDER_HEADER`, their primary keys, and the
  customer-to-order foreign key relationship.
- The SQL fixture can be translated into the canonical model without live
  Snowflake access.
- The JSON fixture round trips through `json.dumps()` and `json.loads()` without
  changing value.
- Rendering Snowflake DDL from the canonical model and translating it back
  produces identical canonical JSON.
- Existing smoke and pytest gates continue to pass.
- Review artifacts record no blocking finding that the model bypasses the
  canonical contract or stores provider/session/UI state in `PhysicalModel`.

## Revision Policy

Changes to this contract should be made deliberately. Expanding Snowflake
coverage, adding quoted identifiers, supporting multiple schemas, adding
diagram state, or changing JSON keys requires either a clearly backwards
compatible extension or a new model version.
