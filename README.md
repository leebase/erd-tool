# ERD Tool

Autonomous mission workspace for a professional database modeling studio.

The first production milestone is Snowflake-focused:

- Connect to Snowflake.
- Reverse engineer existing schemas.
- Produce attractive editable ER diagrams.
- Save reusable project files.
- Generate Snowflake DDL.
- Support successful round-trip engineering.

## Local Snowflake CLI Access

The local `erd-tool` Snowflake CLI connection uses key-pair authentication and
is named `erd-tool`. It is intentionally machine-local: connection details,
the private key, and any credentials remain under the ignored `.snowflake/`
directory or the owner-only Snowflake CLI configuration directory.

Verify the local connection before using a future live-metadata adapter:

```bash
snow connection test --connection erd-tool
snow sql --connection erd-tool --query \
  'select current_user(), current_role(), current_account()'
```

Do not add Snowflake account identifiers, passwords, private keys, session
tokens, or connection settings to project files, fixtures, tests, or commits.
The current product slice remains offline-fixture-first; this connection is an
operator capability for a later, explicitly scoped live-connector slice.

## Project Files

Project files are local, JSON-compatible files for saving the database model
itself. They are intended to let a database modeler reopen the same schema model
later without requiring Snowflake credentials, network access, or a cloud
service.

The current project file envelope is versioned independently from the physical
model:

```json
{
  "project_version": "1",
  "physical_model": {
    "name": "operations-domain-model"
  }
}
```

Today, `physical_model` preserves the model name because that is the full
implemented canonical model. As the canonical physical model expands, the same
project file seam will preserve implemented database modeling content:
namespaces, tables, column order, data types, primary keys, unique constraints,
foreign keys, relationships, nullability, defaults, and comments.

Project files intentionally do not store live Snowflake access details or
machine-local state: account, warehouse, role, connection, session, credentials,
filesystem paths, timestamps, generated smoke evidence, or host-specific values.
The current project contract also does not store diagram canvas state such as
node positions, edge routes, viewport, theme, selection, expanded/collapsed
state, or undo history. Those may become separate top-level project sections
later, but they must not be stored inside `physical_model` or duplicate tables,
columns, or relationships as a second source of truth.

Loading is strict in the current contract. Unsupported project versions, missing
required fields, malformed field types, and unexpected fields fail loudly
instead of producing a partial model. Project-file round trips compare decoded
JSON values, not byte-for-byte formatting, so indentation and member ordering in
the raw file are not meaningful when the loaded value is the same.

The current persistence slice is a model save/load seam only. Browser or desktop
save dialogs, recent-file lists, autosave, backups, diagram layout persistence,
Snowflake connection profiles, DDL generation, and full round-trip engineering
remain later product work.

## Foundation Strategy

This project should evaluate mature open-source foundations before building new
components. Initial candidates include drawDB for visual modeling,
snowflake-dbml-generator for Snowflake metadata extraction, and Graphviz, ELK,
or Mermaid-style tooling for layout and rendering.

Any adopted foundation needs documented license, upstream, local modifications,
fork/adoption strategy, and upstream synchronization plan.
