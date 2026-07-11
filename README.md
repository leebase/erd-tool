# ERD Tool

Autonomous mission workspace for a professional database modeling studio.

## Working application

ERD Tool now combines this repository's canonical model/import/export CLI with
the sibling public drawDB fork at `/Users/lee/projects/drawdb`.

```bash
# Reverse engineer a local SQLite database into a portable project.
PYTHONPATH=src python3 -m erd_tool.cli sqlite-import /path/to/chinook.db \
  --name Chinook --catalog ERD_TOOL_DEMO --schema CHINOOK \
  --output /tmp/chinook.erd.json

# Render standard-table Snowflake DDL. PK/FK/UNIQUE are informational.
PYTHONPATH=src python3 -m erd_tool.cli render-ddl \
  /tmp/chinook.erd.json --output /tmp/chinook.snowflake.sql

# Build and serve the approved drawDB editor fork.
(cd /Users/lee/projects/drawdb && npm ci && npm run build)
PYTHONPATH=src python3 -m erd_tool.cli serve
```

Open `http://127.0.0.1:8765/editor`, choose Snowflake, then use **Open ERD
Project** to load the generated JSON. The editor supports table/column edits,
dragging, ELK automatic layout, project save, local browser persistence, and a
Snowflake DDL preview.

The recommended structural demonstration uses the operator-downloaded Chinook
database from the [SQLite Tutorial sample page](https://www.sqlitetutorial.net/sqlite-sample-database/).
Row-data copying is intentionally optional; the acceptance gate is structure,
mapped Snowflake types, legal identifiers, informational relationships, and a
readable ER model.

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
The application remains credential-free and offline-first. The operator-only
connection was used to prove generated Chinook structures in a live Snowflake
database; it is not read by the application or stored in project files.

## Project Files

Project files are local, JSON-compatible files for saving the database model
itself. They are intended to let a database modeler reopen the same schema model
later without requiring Snowflake credentials, network access, or a cloud
service.

The project file envelope is versioned independently from the physical model:

```json
{
  "project_version": "1",
  "physical_model": {
    "model_version": "1",
    "name": "operations-domain-model",
    "namespaces": [],
    "tables": [],
    "relationships": []
  },
  "diagram_layout": {
    "nodes": {},
    "viewport": {"x": 0, "y": 0, "zoom": 1}
  }
}
```

`physical_model` preserves namespaces, tables, column order, mapped data types,
primary keys, unique constraints, foreign keys, relationships, nullability,
defaults, and comments. `diagram_layout` separately preserves table positions
and viewport state, so visual edits never become a second schema source.

Project files intentionally do not store live Snowflake access details or
machine-local state: account, warehouse, role, connection, session, credentials,
filesystem paths, timestamps, generated smoke evidence, or host-specific values.
Theme, selection, expanded/collapsed state, and undo history are deliberately
not persisted. Relationship routes are derived from the canonical endpoints.

Loading is strict in the current contract. Unsupported project versions, missing
required fields, malformed field types, and unexpected fields fail loudly
instead of producing a partial model. Project-file round trips compare decoded
JSON values, not byte-for-byte formatting, so indentation and member ordering in
the raw file are not meaningful when the loaded value is the same.

The drawDB fork provides browser open/save, local persistence, ELK layout, and
Snowflake DDL preview. Connection-profile management, data copying, recent-file
lists, and backups remain outside this structural milestone.

## Foundation Strategy

This project should evaluate mature open-source foundations before building new
components. Initial candidates include drawDB for visual modeling,
snowflake-dbml-generator for Snowflake metadata extraction, and Graphviz, ELK,
or Mermaid-style tooling for layout and rendering.

Any adopted foundation needs documented license, upstream, local modifications,
fork/adoption strategy, and upstream synchronization plan.
