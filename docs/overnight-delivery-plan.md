# Overnight Delivery Plan

## Outcome

Deliver a locally runnable database-modeling studio that turns Snowflake-style
DDL or a SQLite database into the canonical physical model, lets a user inspect
and edit that model in an ER-diagram browser UI, saves and reloads portable
project files, renders Snowflake DDL, and proves a deterministic semantic
round-trip. The completed application must remain usable without a cloud
service or saved credentials.

## Architecture Decision

The application must use the approved open-source editor foundation rather
than a clean-room browser UI. On 2026-07-10, Lee explicitly authorized the
fork of [`drawdb-io/drawdb`](https://github.com/drawdb-io/drawdb), now at
https://github.com/leebase/drawdb, pinned initially to upstream commit
`b24ad20b6588b9b99609e8a03b87efa7b28cf245`. drawDB supplies the React ERD
editor, SQL import/export, and local-first interaction foundation. The
canonical physical model remains authoritative and must be adapted into and
out of the fork rather than replaced by drawDB's internal representation.

Use `kieler/elkjs`, initially pinned to
`87f373f5697675f94de210f7d07170d7f2f97391`, for automated layout through an
adapter that stores returned coordinates in diagram state. Retain required
AGPL-3.0 license notices, source availability obligations, upstream commit
provenance, and a local-patch changelog for the drawDB fork. The previously
proposed dependency-free static UI is superseded and must not be implemented.

## Delivery Scope

1. Replace the seed-only model with immutable, validated canonical objects for
   namespaces, tables, columns, data types, constraints, and relationships.
   Serialization must be deterministic; columns preserve ordinal order and
   all other model lists use stable identifiers.
2. Implement a constrained Snowflake DDL importer for the checked-in v1
   fixture and a matching Snowflake DDL renderer. The parser must fail clearly
   outside the supported fixture surface rather than silently inventing model
   content.
3. Implement a SQLite importer using `sqlite3` schema introspection. It must
   accept the Chinook sample database documented at
   https://www.sqlitetutorial.net/sqlite-sample-database/ and arbitrary local
   SQLite files without network use. Automated tests create a local SQLite
   fixture; the external Chinook download remains an operator input for the
   forward-engineering demonstration.
4. Extend project serialization to save and load the full canonical model and
   a separate diagram-layout section. Connection/session/account/credential
   data stay forbidden.
5. Integrate the forked drawDB React browser application as the editor surface.
   It must show table cards, columns, primary/foreign-key labels, SVG
   relationships, a selected-table editor, editable table/column names,
   draggable ELK-assisted layout, import controls, save/load JSON, and
   rendered Snowflake DDL.
6. Add CLI commands for Snowflake-fixture import, SQLite import, DDL rendering,
   project save/load, and serving the browser app. The existing smoke command
   remains a fast installed-independent check.
7. Close review debt that blocks the above work: accept canonical `tables` and
   `relationships` in model tests, make constraint order deterministic, reuse
   the CLI parser, add the markdown guidance API, clarify JSON-in-YAML template
   naming, and update the relevant decisions/documentation.

## Acceptance Checks

- The supplied Snowflake SQL fixture imports to the checked-in expected JSON.
- Rendering that model to DDL and re-importing it produces the same canonical
  value.
- A local SQLite database with foreign keys imports to canonical tables and
  relationships; the CLI documents Chinook as the recommended demo database.
- Save/load preserves the model and diagram layout while rejecting credential
  and session fields.
- The browser UI starts through the real CLI, exposes a readable ER diagram,
  accepts an edit, persists it, and displays generated DDL.
- The full Python test suite, syntax checks, CLI smoke, HTTP smoke, formatting
  checks, and independent review pass before handoff.

## Decisions For Lee To Review Later

- drawDB's AGPL-3.0 obligations are accepted for this public fork. Preserve
  license/source notices and document all local patches before release.
- ELK/elkjs is the approved layout engine; pin its version/commit and keep it
  behind the canonical-model diagram-layout adapter.
- SQLite is an import source and forward-engineering demonstration input; the
  first renderer targets Snowflake DDL as the product's declared first focus.
- The Chinook database is not committed as a binary fixture. The app accepts a
  downloaded local `chinook.db`, while tests use a deterministic generated
  SQLite schema to keep CI offline and reviewable.
