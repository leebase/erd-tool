# Context

## Snapshot

- Mode: 2, with explicit autonomous delivery authorization for this milestone.
- Current state: working Snowflake-focused ERD application across this repository
  and the public `/Users/lee/projects/drawdb` fork.
- Canonical model v1 is immutable, deterministic, credential-free, and supports
  multiple Snowflake namespaces, tables, ordered columns, mapped types,
  PK/UQ/FK constraints, relationships, defaults, and comments.
- CLI supports Snowflake DDL import/render, read-only SQLite introspection,
  strict project validation, and serving the built editor over loopback HTTP.
- The drawDB fork supports Snowflake editing, canonical JSON open/save, local
  persistence, ELK auto-layout, DDL preview, multi-schema models, and legacy
  namespace migration to `MODEL.PUBLIC`.
- Snowflake constraints are always emitted as informational `NOT ENFORCED`;
  foreign keys are deferred with `ALTER TABLE`, so cycles and self-references
  work. The application never adds `RELY` automatically.
- Exact foundations: drawDB upstream base
  `b24ad20b6588b9b99609e8a03b87efa7b28cf245`; runtime `elkjs@0.11.1` with
  evaluated source pin `87f373f5697675f94de210f7d07170d7f2f97391` recorded in
  the fork. AGPL-3.0/EPL-2.0 notices and patch history are preserved.
- Local Snowflake access remains operator-only key-pair authentication under
  ignored machine-local configuration; no application credential surface exists.

## What's Happening Now

### Recently Completed

- Reverse engineered the official Chinook SQLite database into 11 tables,
  64 columns, 11 keys/relationships, and a canonical ER project.
- Forward engineered the generated structure into live
  `ERD_TOOL_CHINOOK.PUBLIC`. Information Schema verified 11 tables, 64 columns,
  11 primary keys, 11 foreign keys, and zero enforced constraints.
- Exercised the real browser workflow: import, edit/rename, ELK layout, DDL
  preview, download, local persistence, reload, and a two-schema CLI-to-browser
  round trip.
- Repaired all material independent-review findings, including SQLite affinity
  and FK edges, quote-aware Snowflake defaults/comments, legal identifiers,
  cyclic FKs, multi-schema projection, validation parity, legacy projects,
  layout persistence/undo, and Snowflake type bounds/defaults.
- Verification is green: 119 Python tests; 46 drawDB unit tests; ESLint; Vite
  production build; real Playwright cross-repository flow; Agent-Orch doctor;
  live Snowflake metadata verification; and credential scans.
- Added the previously missing importable markdown-heading guidance API. The
  JSON-formatted `.yaml` playbook template is intentionally retained because
  JSON is valid YAML and the existing Agent-Orch/template references depend on
  that stable path.

### Decisions Locked

- `erd-tool` owns canonical semantics, SQLite/Snowflake translation, project
  validation, CLI, and local serving; the drawDB fork owns editor projection and
  interaction; elkjs owns position calculation only.
- Structure migration is the required gate. Row-data movement remains optional
  and was not added.
- Snowflake migrations in drawDB's legacy version-diff feature are disabled;
  canonical project DDL is the authoritative Snowflake export path.
- Partial SQLite unique indexes are rejected in v1 instead of being silently
  strengthened to unconditional uniqueness.

### Next Actions Queue

1. Commit and push both repositories.
2. Future optional work: live Snowflake metadata reverse engineering and row-data
   copy; neither is required for this completed structural milestone.
