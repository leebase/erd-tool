# ERD Tool Delivery Implementation Contract

Recorded: 2026-07-10.

## Repository Ownership

The application is delivered by two public repositories with an explicit JSON
contract between them.

- `erd-tool` owns the canonical physical model, Snowflake DDL import/rendering,
  SQLite introspection, project-file validation, CLI workflows, and the local
  browser-app launcher.
- `leebase/drawdb` owns the AGPL-3.0 React editor, canvas interactions,
  browser-local persistence, canonical-project adapters, and ELK-assisted
  diagram layout.

Neither repository may introduce a second authoritative database model.
drawDB's table/field/relationship objects are an editable view projection. A
saved ERD Tool project is authoritative only after the view is converted back
to the canonical `physical_model` shape and validated.

## Canonical Model Contract

`PhysicalModel` v1 contains `model_version`, `name`, `namespaces`, `tables`,
and derived `relationships`. Immutable value objects validate ids, references,
column ordinals, supported types, constraint shapes, and deterministic list
ordering. Columns preserve ordinal order; namespaces, tables, constraints, and
relationships sort by id.

Snowflake fixture import supports the exact documented v1 surface and fails on
unsupported statements, types, quoted identifiers, malformed constraints, and
unresolved references. Snowflake rendering is deterministic and semantic:
rendered DDL must re-import to the same canonical dictionary.

SQLite import uses only Python's standard `sqlite3` module. It reads local
files through `sqlite_master`, `PRAGMA table_info`, `PRAGMA index_list`,
`PRAGMA index_info`, and `PRAGMA foreign_key_list`; it never copies data or
stores connection paths. SQLite type affinities map explicitly to canonical
types suitable for Snowflake forward engineering. Chinook is an operator-
supplied demonstration database, while automated tests generate an offline
fixture.

SQLite identifiers are converted to legal unquoted Snowflake identifiers by a
documented deterministic rule: uppercase ASCII letters, digits, `_`, and `$`
are retained; other characters become `_`; an identifier that does not begin
with a letter or underscore gains a leading underscore; empty results and
post-normalization collisions fail clearly. SQLite declared types are mapped
to the closest supported Snowflake physical type rather than copied as
provider-native text. The Chinook mapping includes `INTEGER` to
`NUMBER(38, 0)`, character types to bounded `VARCHAR`, `NUMERIC(p,s)` to
`NUMBER(p,s)`, and datetime types to `TIMESTAMP_NTZ(9)`.

## Project File Contract

Project version `1` contains:

```json
{
  "project_version": "1",
  "physical_model": {},
  "diagram_layout": {
    "nodes": {
      "table:CATALOG.SCHEMA.TABLE": {"x": 0, "y": 0}
    },
    "viewport": {"x": 0, "y": 0, "zoom": 1}
  }
}
```

`diagram_layout` is optional when loading for backward compatibility and is
emitted by new saves. It may contain only canonical table ids and numeric
coordinates/viewport values. It must not duplicate columns or relationships.
Unknown top-level fields and credential/session fields fail closed.

## drawDB Adapter Contract

The fork adds pure JavaScript adapters with deterministic tests:

- canonical project -> drawDB diagram projection;
- drawDB diagram projection -> canonical project;
- canonical model -> deterministic Snowflake DDL;
- canonical model -> ELK graph and ELK positions -> `diagram_layout`.

Canonical ids remain the drawDB table and field ids. Primary-key and unique
flags project onto fields/unique constraints; foreign keys project onto drawDB
relationships. View-only color, collapsed state, and coordinates never enter
`physical_model`. Table and column renames rebuild path-derived ids and all
references during conversion back to the canonical model.

Snowflake is an explicit drawDB database choice with the v1 canonical type
families. The existing editor supplies table cards, column labels, relationship
SVGs, selected-table editing, and drag behavior. ERD Tool additions supply
canonical project import/export, Snowflake DDL export, and an Auto Layout action
powered by pinned `elkjs`.

## Local Application Boundary

`erd-tool serve` serves the already-built drawDB fork from a supplied
`--frontend-dir` or the sibling `../drawdb/dist` default. It uses Python's
standard HTTP server, binds to loopback by default, supports SPA fallback, and
never exposes Snowflake credentials. Development remains available through the
fork's normal Vite command.

## Verification

Delivery is accepted only when all of the following pass from clean repository
states:

1. Python unit and integration tests, compilation, format/lint checks, CLI
   smoke, Snowflake fixture semantic round trip, generated SQLite import, and
   real local HTTP smoke.
2. drawDB dependency install, adapter tests, lint, production build, and browser
   smoke that imports a canonical project, edits a name, runs Auto Layout,
   exports/reloads the project, and displays Snowflake DDL.
3. A read-only real Snowflake identity check through the machine-local
   key-pair profile; no credentials or machine-local connection material in
   either Git diff.
4. A live structure-migration demonstration imports the operator-supplied
   Chinook SQLite database, renders legal Snowflake DDL, executes it through
   the `erd-tool` key-pair profile into dedicated standard tables, and queries
   Snowflake Information Schema to verify tables, columns, primary keys, and
   foreign keys. The verified canonical model is also opened as the ER diagram.
   Row data migration is optional and is not an acceptance dependency.
5. Independent `gpt-5.6-terra-high` review of both diffs, with every material
   finding repaired and reverified.

## Boundaries

- Preserve drawDB's AGPL-3.0 license, notices, public source, upstream pin, and
  a patch changelog. Preserve elkjs EPL-2.0 notices and pin the dependency.
- Do not add `snowflake-dbml-generator`.
- Do not add password authentication or committed credentials.
- Snowflake standard-table primary, unique, and foreign keys are informational
  metadata. Do not claim Snowflake enforces them, and do not emit `RELY` unless
  a separately reviewed data-integrity guarantee exists. Snowflake documents
  that only NOT NULL and CHECK constraints are enforced for standard tables:
  https://docs.snowflake.com/en/sql-reference/constraints
- Workers implement bounded written specs only. They do not plan, update
  AgentFlow decision documents, commit, or push.
