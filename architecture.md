# Architecture

## Current architecture

- Primary language: TypeScript/Python.
- Current seed package: Python under `src/erd_tool/`.
- Default worker runtime: `codex_cli`.
- Smoke surface: `python3 scripts/smoke.py`.
- Test surface: `python3 -m pytest tests`.

## Implemented Two-Repository Application

Recorded: 2026-07-10.

`erd-tool` now implements the immutable canonical v1 object graph, constrained
Snowflake DDL import/rendering, read-only SQLite introspection, strict project
serialization with separate diagram layout, CLI file workflows, and loopback
static serving. The public sibling fork `leebase/drawdb` remains the approved
AGPL-3.0 React editor and maps canonical projects into its existing editable
diagram projection.

SQLite identifiers normalize deterministically to legal unquoted Snowflake
identifiers. Chinook-compatible declared types map to Snowflake NUMBER, FLOAT,
VARCHAR, DATE, TIMESTAMP_NTZ, BOOLEAN, and BINARY. Generated standard-table
PRIMARY KEY, UNIQUE, and FOREIGN KEY constraints carry `NOT ENFORCED` and never
gain `RELY` automatically; NOT NULL remains enforced by Snowflake.

The runtime layout package is exact `elkjs@0.11.1` (upstream tag commit
`572e73323791d05f09b0815ff639af2b67f202ab`). The newer evaluated source pin
`87f373f5697675f94de210f7d07170d7f2f97391` remains recorded, but it has no
published runnable artifact and its clean local build currently fails in
upstream Xtext generation. Mixing generated runtime files across versions is
forbidden.

## Local Snowflake Key-Pair Authentication

Recorded: 2026-07-10.

The local developer connection named `erd-tool` authenticates the Snowflake
user `LEEBASE` with a dedicated RSA key pair. Its private key is machine-local
under the ignored `.snowflake/` directory and has owner-only permissions; only
the public key is registered with Snowflake. The CLI profile uses
`SNOWFLAKE_JWT`, `ACCOUNTADMIN`, and the default `COMPUTE_WH` warehouse.

This is an operator access boundary, not part of the product model. The
canonical physical model, project files, offline fixtures, test data, and
committed documentation must continue to exclude credentials, account/session
details, warehouse state, and local key paths. A live connector may use this
local capability only after a separately governed product slice defines its
read-only metadata boundary and test strategy.

## Direction

Durable components should evolve in this order:

1. Database provider.
2. Metadata extraction.
3. Canonical physical model.
4. Diagram engine.
5. Editing engine.
6. Forward engineering.
7. Project storage.
8. Documentation generation.

The canonical physical model is the center of the system. Provider, renderer,
documentation, and DDL features should target it rather than bypassing it.

## Project Serialization

Recorded: 2026-07-09.

Project serialization is a strict versioned envelope around the complete
canonical physical model plus a separate diagram layout. The implemented seams
in `src/erd_tool/project_serialization.py` save/load `ProjectDocument` values and
retain compatibility helpers for callers that only need `PhysicalModel`.

`physical_model` contains deterministic namespaces, tables, ordered columns,
types, constraints, relationships, defaults, and comments. `diagram_layout`
contains only canonical table-id positions and viewport. Theme, selection,
collapse state, relationship routes, and undo history are derived or transient.

File dialogs, browser downloads, and IndexedDB persistence live in the drawDB
adapter. Credentials, accounts, warehouses, roles, sessions, host paths, and
provider-native blobs are rejected rather than serialized. Unsupported versions,
unknown fields, invalid identifiers/types, unresolved references, and malformed
layout fail loudly; missing layout defaults safely for older canonical files.

Round-trip equality is decoded JSON value equality, not byte-for-byte file text.
Pretty-printing, indentation, and raw object member ordering are presentation
choices as long as `json.dumps()` followed by `json.loads()` preserves the same
project value and reloading produces the same canonical model.

Diagram layout persistence is also left for a later project-file section. When
that section exists, it should store view state such as node positions or
viewport settings by referencing canonical ids; it should not redefine the
database model.

## Canonical Physical Model v1

Recorded: 2026-07-09.

This is the durable v1 contract for Snowflake-focused model definitions and the
initial Snowflake round-trip fixture. It is intentionally narrower than the
product vision: the contract defines physical model state, deterministic
serialization, and semantic DDL round-trip expectations. It does not define UI
layout, live Snowflake connectivity, project collaboration, warehouse/session
state, or every Snowflake object type.

The canonical physical model remains provider-neutral at the root. Snowflake
adapters may ingest metadata into it and render DDL from it, but they must not
replace it with a Snowflake-native object graph. Diagram state, editor state,
connection state, and generated runtime evidence must stay outside the
canonical model payload.

V1 deliberately models a small, enforceable slice: namespaces, permanent base
tables, columns, primary keys, unique constraints, foreign keys, derived
relationships, comments when supported, and normalized Snowflake type text for
the fixture types listed below. Anything outside this list must be rejected or
left unimplemented until the contract is revised.

### Canonical Physical Model v1 Objects

`PhysicalModel` is the root object. For v1 it contains these required fields:

- `model_version`: string, exactly `"1"`.
- `name`: stable human-readable model name.
- `namespaces`: deterministic list of `Namespace` objects.
- `tables`: deterministic list of `Table` objects.
- `relationships`: deterministic list of `Relationship` objects.

`Namespace` represents a physical container for tables:

- `id`: stable identifier.
- `catalog`: required legal Snowflake database/catalog identifier.
- `schema`: required legal Snowflake schema identifier.

`catalog` is the Snowflake database and `schema` is the Snowflake schema.
Multiple namespaces and qualified cross-schema relationships are supported.

Namespace ids use the normalized containment path:
`namespace:<CATALOG>.<SCHEMA>`.

`Table` represents a permanent physical base table:

- `id`: stable identifier.
- `namespace_id`: containing `Namespace.id`.
- `name`: table name.
- `kind`: exactly `"table"` for v1.
- `columns`: ordinal list of `Column` objects.
- `constraints`: deterministic list of `TableConstraint` objects.
- `comment`: string or `null`.

Temporary, transient, external, hybrid, Iceberg, dynamic, and derived table-like
objects are out of scope for v1.

Table ids use `table:<CATALOG>.<SCHEMA>.<TABLE>`. Table names remain separate
from ids so future display names and quoted identifier support can evolve
without changing the v1 containment rule.

`Column` represents a physical table column:

- `id`: stable identifier scoped by table and column name.
- `name`: column name.
- `ordinal`: one-based integer preserving table column order.
- `data_type`: `DataType` object.
- `nullable`: boolean.
- `default`: normalized SQL expression text or `null`.
- `comment`: string or `null`.

Column order is semantic and must survive SQL ingest, JSON serialization, DDL
rendering, and a second ingest pass. `nullable: false` renders as `NOT NULL`.
Default expressions are preserved as normalized SQL text; v1 does not require a
general SQL expression AST.

Column ids use `column:<CATALOG>.<SCHEMA>.<TABLE>.<COLUMN>`. The column's
`ordinal` is the source of truth for order; sorting by column id is forbidden
inside a table.

`DataType` represents a normalized physical SQL type:

- `family`: uppercase type family.
- `text`: canonical Snowflake render text.
- `precision`: integer or `null`.
- `scale`: integer or `null`.
- `length`: integer or `null`.

`TableConstraint` represents declared table constraints:

- `id`: stable identifier scoped by table and constraint name or generated role.
- `name`: explicit constraint name, or `null` only when the source omits one.
- `kind`: `"primary_key"`, `"unique"`, or `"foreign_key"`.
- `columns`: ordered list of local column ids.
- `referenced_table_id`: target table id for foreign keys, otherwise `null`.
- `referenced_columns`: ordered target column ids for foreign keys, otherwise
  empty.

Primary key and unique constraints are represented on the owning table. Foreign
key constraints are represented on the owning table and also produce a
`Relationship`. Snowflake constraint enforcement semantics are out of scope:
declared constraints must round trip as metadata, and tests must not assume
Snowflake enforces them.

`Relationship` is the canonical projection used by future diagrams and
documentation:

- `id`: stable identifier.
- `name`: foreign key constraint name or generated relationship name.
- `source_table_id`: table containing the foreign key columns.
- `source_column_ids`: ordered foreign key column ids.
- `target_table_id`: referenced table.
- `target_column_ids`: ordered referenced column ids.
- `cardinality`: exactly `"many_to_one"` for v1 foreign keys.

Relationships are derived from foreign key constraints. They must not carry UI
edge state such as coordinates, colors, selection, route points, labels placed
by a user, or collapsed/expanded state.

### Snowflake Type And Identifier Handling

The Snowflake v1 fixture supports only these type families:

- `NUMBER`, including precision and scale, rendered as `NUMBER(p,s)`.
- `VARCHAR`, including length, rendered as `VARCHAR(n)`.
- `DATE`, rendered as `DATE`.
- `TIMESTAMP_NTZ`, including precision, rendered as `TIMESTAMP_NTZ(p)`.
- `BOOLEAN`, rendered as `BOOLEAN`.

Unsupported Snowflake types must fail loudly in v1 fixture translation instead
of degrading to strings or provider-specific extension blobs. This keeps the
contract honest about the current capability surface.

For the v1 fixture, type aliases and omitted defaults are normalized before
serialization. `DECIMAL`, `NUMERIC`, and unparameterized `NUMBER` are not part of
the fixture contract. `STRING` and unparameterized `VARCHAR` are not part of the
fixture contract. A parser may support those later, but the first fixture should
only assert the explicit canonical forms above.

Identifier handling is deliberately conservative:

- Unquoted Snowflake identifiers normalize to uppercase.
- Canonical ids are deterministic from normalized containment paths, for
  example `table:ANALYTICS.CORE.CUSTOMER`.
- The v1 fixture uses unquoted identifiers only.
- Canonical SQL rendering does not quote identifiers in v1.
- Case-sensitive quoted identifiers, escaped quotes, mixed-case names, and
  identifiers requiring quoting are out of scope for v1.
- Provider account, warehouse, role, connection, session, and execution context
  identifiers must not appear in canonical JSON.

## Snowflake Round-Trip Fixture

The Snowflake round-trip fixture is the first executable proof that provider
metadata can enter the canonical physical model, serialize deterministically,
render back to Snowflake DDL, and return to the same canonical value. It must
stay local, credential-free, and small enough that every acceptance failure
points to a specific modeling contract gap rather than to live infrastructure.

The recommended v1 fixture namespace is catalog `ANALYTICS`, schema `CORE`.
The recommended parent table is `CUSTOMER`; the recommended child table is
`ORDER_HEADER`; the required relationship is `ORDER_HEADER.CUSTOMER_ID`
referencing `CUSTOMER.CUSTOMER_ID`.

### Serialization Expectations

The canonical JSON representation is the v1 project-file payload for physical
model state. Later project files may wrap it with diagram and editor state, but
that state must remain outside `PhysicalModel`.

Serialization requirements:

- JSON-compatible dictionaries only: strings, numbers, booleans, `null`, lists,
  and objects.
- Deterministic object and key order across Python runs.
- Deterministic ids derived from canonical names and containment, not random
  UUIDs.
- Lists sorted by stable identifier except `Table.columns`, which preserves
  one-based column ordinal order. Constraints sort by stable id after preserving
  each constraint's ordered column lists.
- `json.dumps()` followed by `json.loads()` must preserve value equality.
- No timestamps, filesystem paths, hostnames, Snowflake accounts, warehouses,
  roles, connections, sessions, UI state, or machine-local values.
- Backwards-compatible optional fields require documented defaults; incompatible
  shape changes require a model version bump.

Forbidden canonical JSON keys in v1 include `account`, `warehouse`, `role`,
`connection`, `session`, `canvas`, `nodes`, `edges`, `viewport`, `theme`,
`selected`, and `history`.

### DDL Round-Trip Expectations

The v1 DDL round trip is semantic, not byte-for-byte textual preservation.

Required flow:

1. Load the Snowflake v1 SQL fixture.
2. Translate it into `PhysicalModel`.
3. Serialize the model to JSON-compatible dictionaries.
4. Compare against the expected canonical JSON fixture.
5. Render Snowflake DDL from the canonical model.
6. Translate the rendered DDL back into `PhysicalModel`.
7. Assert the second model serializes identically to the first model.

DDL generation rules:

- Emit deterministic object order: namespace setup, parent tables, child tables,
  then foreign key constraints when separate statements are needed. For the v1
  fixture, `CUSTOMER` must render before `ORDER_HEADER`.
- Render unquoted uppercase identifiers for v1.
- Render canonical type `text` exactly.
- Preserve column order, nullability, default expression text, comments when
  implemented, primary keys, unique constraints, and foreign keys.
- Prefer stable explicit constraint names in fixture DDL.
- DDL parsing and rendering may be implemented by a focused fixture parser at
  first. The parser must still fail on unsupported constructs rather than
  ignoring them.

Allowed textual differences from source SQL include whitespace, line wrapping,
constraint placement inline versus table-level, and optional `CREATE SCHEMA` or
`USE` statements when the canonical namespace still round trips correctly.

Rejected differences include lost tables, columns, relationships, constraints,
nullability, defaults, type precision/scale/length, namespace information,
provider/session fields in canonical JSON, or diagram/UI keys in canonical JSON.

## Acceptance Checks

Acceptance for this architecture slice requires evidence that the canonical
model, project serialization seam, and Snowflake fixture all agree on the same
durable data shape. A passing run must demonstrate deterministic local checks
instead of relying on prose, live credentials, or UI-only inspection.

### Snowflake Fixture Acceptance Checks

The v1 Snowflake fixture must be small, local, and executable without network
access or credentials. It must cover:

- One database/catalog and one schema.
- At least two permanent tables in the same namespace.
- One primary key on each table.
- One foreign key from the child table to the parent table.
- Nullable and non-nullable columns.
- `NUMBER(38, 0)` and another `NUMBER` with nonzero scale.
- `VARCHAR` with length.
- `DATE`.
- `TIMESTAMP_NTZ` with precision.
- `BOOLEAN`.
- At least one default expression.
- Optional table or column comments only when represented by the implementation.

The required table shape is:

- `ANALYTICS.CORE.CUSTOMER`, with primary key `CUSTOMER_ID`.
- `ANALYTICS.CORE.ORDER_HEADER`, with primary key `ORDER_ID`.
- `ORDER_HEADER.CUSTOMER_ID` as a foreign key to `CUSTOMER.CUSTOMER_ID`.

The fixture is accepted only when tests demonstrate:

- SQL fixture translation creates the expected canonical object graph.
- Expected canonical JSON is stable and JSON round-trippable.
- Generated DDL translated back into the model produces identical canonical
  JSON.
- Existing smoke and pytest gates continue to pass.
- Review evidence has no blocking finding that the implementation bypasses the
  canonical model or stores provider/session/UI state in `PhysicalModel`.

The fixture must not require live Snowflake credentials, network access,
case-sensitive quoted identifiers, cross-database relationships, cross-schema
relationships, or Snowflake DDL features outside this v1 object list.

## Open Source Foundation Evaluation (Historical Decision Record)

The evaluation below records how candidates were assessed. Its original
"pending approval" language is superseded for drawDB and elkjs by the explicit
approval and implemented two-repository decision at the top of this document.

Recorded: 2026-07-08.

This evaluation is an architecture decision record, not a dependency adoption.
No runtime dependency should be added from this list until a later implementation
slice confirms fit, packaging, license obligations, security posture, and human
approval where noted. Any integration must preserve the canonical physical model
as the internal contract; third-party formats are import/export or layout
adapters, not the source of truth.

### Adoption Decisions

| Candidate | Decision | Human approval before runtime dependency? |
| --- | --- | --- |
| drawDB | Defer runtime adoption; use as product and interaction reference only. | Yes, because AGPL-3.0 affects distribution and source obligations. |
| snowflake-dbml-generator | Avoid for now. | Yes, because upstream identity and license are unverified. |
| Graphviz | Defer as optional export, documentation, or batch-layout tooling. | Yes, before required runtime adoption. |
| ELK / elkjs | Adopt for the first browser layout spike, pending approval. | Yes, before adding ELK or elkjs as runtime dependency. |
| Mermaid | Defer for documentation/export workflows; avoid as primary editor. | Yes, before runtime adoption. |

These decisions favor foundations that strengthen the canonical physical model
without replacing it. Layout and rendering candidates may become adapters around
the model; extraction candidates may inform provider work; UI products may
inform interaction design only unless licensing and architecture fit are later
approved.

### Synchronization Strategy

Adopted foundations should be pinned by release or upstream commit, with a local
changelog for version bumps and any project-specific patches. Prefer adapter
boundaries over forks. If a fork becomes necessary, keep it narrow, document the
upstream base, review upstream releases periodically, and contribute general
fixes back where maintainers are receptive. For unverified or deferred
candidates, record identity, license, latest release/commit, maintenance signal,
and object coverage before any implementation slice relies on them.

### Contribution and Review Notes

Contribution opportunities should be limited to general-purpose improvements:
Snowflake dialect fidelity, reproducible layout fixtures, documentation,
accessibility fixes, security hardening, and performance cases that apply beyond
this product. Before runtime adoption, each candidate needs a scoped
implementation review covering license obligations, packaging footprint,
security posture, offline behavior, and whether the integration preserves the
canonical physical model as the source of truth.

### drawDB

- Upstream repository identity:
  [`drawdb-io/drawdb`](https://github.com/drawdb-io/drawdb), described by
  upstream as a browser database ERD editor and SQL generator.
- License: GNU AGPL-3.0, per the upstream repository license.
- Decision: Approved and adopted through the public `leebase/drawdb` fork with
  AGPL-3.0 source, notices, upstream provenance, and patch history preserved.
- Rationale: drawDB is highly relevant to the visual modeling surface: React,
  browser-first ERD editing, SQL import/export, DBML support, IndexedDB local
  storage patterns, and a mature interaction model. The AGPL-3.0 license is a
  major architectural and distribution constraint for a tool intended to be
  professional, offline-first, and potentially distributable outside a purely
  open AGPL application. The local product also needs a Snowflake-centered
  canonical physical model, not drawDB's internal model as the primary model.
- Local modification expectations: None while deferred. If approved later,
  expect substantial adapter work for canonical-model mapping, Snowflake dialect
  coverage, project-file semantics, diagram persistence, and UI integration.
  Avoid copying source into this repository before a license decision.
- Synchronization strategy: If adopted after approval, prefer upstream package or
  a clearly documented fork with a pinned upstream commit, periodic upstream
  review, and a changelog of local patches. Keep local changes small and propose
  general fixes upstream.
- Contribution opportunities: Snowflake dialect fidelity, canonical metadata
  import/export adapters, accessibility fixes, diagram performance improvements,
  and documentation for offline project workflows could be useful upstream if
  implemented generically.
- Risks: AGPL network/source obligations, large UI ownership surface, potential
  mismatch between drawDB storage and this project's canonical model, and
  long-term fork maintenance if deep customization is required.
- Later human approval needed: Satisfied for this public-fork delivery.

### snowflake-dbml-generator

- Upstream repository identity: Unverified. Searches for the exact candidate
  name `snowflake-dbml-generator` did not identify a stable public upstream
  repository or package during this evaluation.
- License: Unknown until an upstream repository or package is identified.
- Decision: Avoid for now.
- Rationale: The candidate name suggests a narrow Snowflake metadata to DBML
  extractor, which could be relevant as a reference for reverse engineering.
  However, without a verifiable upstream identity, license, maintenance signal,
  or source code, it cannot be treated as a foundation. The project should not
  depend on an unidentified package or copy logic from unsourced snippets.
- Local modification expectations: None. If a real upstream is later found,
  evaluate it as a metadata extraction reference, not as a canonical model
  replacement.
- Synchronization strategy: None while unverified. If identified later, record
  repository URL, license, latest release/commit, Snowflake object coverage, and
  test fixtures before considering adoption.
- Contribution opportunities: Unknown. Potentially Snowflake metadata coverage,
  DBML fidelity, and test fixtures if a maintained upstream appears.
- Risks: Unknown license, unknown provenance, unknown maintenance status,
  possible package-name confusion, and possible mismatch between DBML output and
  this project's richer canonical physical model.
- Later human approval needed: Yes, before any runtime dependency adoption,
  source copy, or fork, because both identity and license are currently unknown.

### Graphviz

- Upstream repository identity:
  [`graphviz/graphviz`](https://gitlab.com/graphviz/graphviz) on GitLab, the
  main repository for Graphviz graph visualization tools.
- License: Eclipse Public License 2.0, per upstream repository and Graphviz
  license documentation.
- Decision: Defer as an optional export, documentation, or batch-layout
  foundation; do not use as the primary interactive diagram engine.
- Rationale: Graphviz is mature, battle-tested, and strong at deterministic
  layout from generated graph descriptions, with SVG/PDF/image output useful for
  documentation and CI artifacts. It is less aligned with a modern editable ERD
  studio because Graphviz is a layout/rendering tool, not an interactive React
  editor, and upstream explicitly notes it is not intended as a Visio-style
  replacement. It also introduces native binary packaging and sandboxing
  questions.
- Local modification expectations: Prefer zero local modifications. Integrate,
  if at all, through a DOT exporter from the canonical physical model plus an
  isolated command invocation or library boundary.
- Synchronization strategy: Use released Graphviz packages from OS package
  managers or pinned binaries only after packaging approval. Track upstream
  security and release notes; keep DOT generation local and avoid patching
  Graphviz itself.
- Contribution opportunities: Bug reports with minimized DOT fixtures,
  documentation improvements for database-style diagrams, and layout regression
  cases if ERD-specific issues are discovered.
- Risks: Native dependency footprint, platform packaging complexity, layout
  tuning limits for dense ER diagrams, security concerns if untrusted DOT is
  processed, and mismatch with interactive editing requirements.
- Later human approval needed: Yes, before adding Graphviz as a required runtime
  dependency. Approval is less strict for optional developer-only smoke tooling,
  but still requires an explicit implementation slice.

### ELK / elkjs

- Upstream repository identity:
  [`eclipse-elk/elk`](https://github.com/eclipse-elk/elk) for the Eclipse Layout
  Kernel and [`kieler/elkjs`](https://github.com/kieler/elkjs) for the
  JavaScript library transpiled from ELK's Java sources.
- License: Eclipse Public License 2.0, per upstream license files.
- Decision: Adopted as exact runtime `elkjs@0.11.1` behind the local layout
  adapter; the evaluated newer source pin remains documented but is not mixed
  into the runtime.
- Rationale: ELK is the best technical fit among the evaluated layout
  foundations for an editable ERD studio. It computes positions rather than
  owning rendering, supports hierarchical nodes and explicit ports, and has a
  JavaScript distribution that can fit a React/TypeScript UI while keeping the
  canonical physical model local. Ports and layered layouts map well to table
  columns, relationship endpoints, schema grouping, and future manual layout
  constraints.
- Local modification expectations: No fork expected initially. Build a local
  adapter that converts canonical-model diagram projections into ELK graph input
  and stores returned coordinates in project/diagram state. Keep rendering and
  interaction code owned locally.
- Synchronization strategy: Use pinned elkjs releases once approved. Maintain
  layout fixture tests for small, medium, and dense Snowflake schemas so version
  bumps are deliberate. Track both elkjs and ELK release notes because elkjs is
  generated from ELK.
- Contribution opportunities: Reproducible layout fixtures, documentation for ERD
  use cases, bug reports around ports and compound nodes, and possibly examples
  showing React-based database diagrams using elkjs.
- Risks: EPL-2.0 obligations, bundle size and web-worker requirements, layout
  latency on large schemas, generated JavaScript debugging complexity, and
  version coupling between ELK and elkjs.
- Later human approval needed: Satisfied for the pinned elkjs runtime.

### Mermaid

- Upstream repository identity:
  [`mermaid-js/mermaid`](https://github.com/mermaid-js/mermaid), a
  JavaScript-based diagramming and charting tool that renders diagrams from
  markdown-like text.
- License: MIT, per the upstream repository license.
- Decision: Defer for documentation/export workflows; avoid as the primary ERD
  editor or canonical layout foundation.
- Rationale: Mermaid is excellent for lightweight, text-based diagrams in
  documentation, has broad ecosystem support, and includes ER-style diagramming.
  It is not a strong foundation for a professional editable database modeling
  studio because its model is text syntax, its ER feature set is intentionally
  compact, and it does not own the rich interactive editing, Snowflake metadata,
  or round-trip project model needed here.
- Local modification expectations: None. If used later, generate Mermaid text
  from the canonical physical model for README/docs export and render it through
  upstream Mermaid without patching.
- Synchronization strategy: Prefer a pinned npm package only in a documentation
  or preview slice. Keep generated Mermaid syntax covered by snapshot tests so
  upstream syntax/rendering changes are visible.
- Contribution opportunities: ER syntax documentation clarifications, parser
  bug reports, and examples for database documentation generated from external
  schemas.
- Risks: Text syntax cannot represent the full canonical physical model,
  rendering output may vary by Mermaid version, security review is required for
  rendering user-provided text, and interactive editing would require a separate
  local tool surface anyway.
- Later human approval needed: Yes, before adding Mermaid as a runtime
  dependency. Lower-risk use as generated markdown text still needs a scoped
  implementation decision.
