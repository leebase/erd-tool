# ERD Tool

ERD Tool is a local-first data modeling application for reverse engineering,
editing, arranging, and forward engineering database structures. The current
release focuses on macOS and Snowflake while preserving an offline canonical
project format.

The application can:

- reverse engineer SQLite databases into editable ER diagrams;
- connect directly to Snowflake with password, key-pair, or browser SSO
  authentication;
- reverse engineer Snowflake databases and schemas;
- edit tables, columns, keys, relationships, comments, and layout;
- automatically arrange diagrams with ELK;
- save portable, credential-free `.erd.json` project files; and
- generate Snowflake DDL with informational `NOT ENFORCED` constraints.

The Chinook acceptance workflow has been proven end to end: 11 SQLite tables,
64 columns, 11 primary keys, and 11 foreign keys were forward engineered into
Snowflake and reverse engineered back into the editor.

> **Release status:** v0.1.0 is an unsigned source release tested on Apple
> Silicon macOS. Linux and Windows packaging are present but are not release
> gates yet.

## Run the Mac application from source

Prerequisites: Node.js 22 or newer and npm.

```bash
git clone https://github.com/leebase/erd-tool.git
cd erd-tool/desktop
npm ci
npm run start:electron
```

The Electron window is the application; there is no local web address to open.

Build an unsigned Apple Silicon installer and ZIP:

```bash
cd desktop
npm run dist:desktop:mac:arm64
```

Artifacts are written to `desktop/dist-installers/`. Because v0.1.0 is not
signed or notarized, macOS may require an explicit **Open** from Finder's
context menu.

## Snowflake connections

Open **Snowflake** in the application and create a machine-local profile. ERD
Tool supports password, key-pair, and external-browser SSO authentication.
Connection secrets remain in the operating system's local application data and
are never written to an ERD project file. Use a least-privileged Snowflake role
with access only to the databases and schemas you intend to model.

## Canonical command-line tools

The MIT-licensed Python package provides deterministic import, validation, and
DDL workflows independently of the desktop editor.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'

erd-tool sqlite-import /path/to/chinook.db \
  --name Chinook --catalog ERD_TOOL_DEMO --schema PUBLIC \
  --output /tmp/chinook.erd.json
erd-tool project-check /tmp/chinook.erd.json
erd-tool render-ddl /tmp/chinook.erd.json \
  --output /tmp/chinook.snowflake.sql
```

See the [Chinook walkthrough](docs/tutorials/sqlite-to-snowflake-chinook.md)
for the complete structural round trip.

## Repository layout

- `src/erd_tool/` — canonical model, CLI, SQLite import, and Snowflake DDL tools.
- `desktop/` — Electron/React visual editor derived from drawDB.
- `tests/` and `desktop/tests/` — deterministic Python and desktop test suites.
- `docs/` — project contracts, tutorials, and delivery evidence.

## Security and privacy

ERD Tool is local-first. Project files contain the database model and diagram
layout, not passwords, private keys, account tokens, session identifiers, or
machine-local connection profiles. Please report vulnerabilities according to
[SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), and the licensing boundary below before
opening a pull request.

## Licensing

This is a multi-license repository:

- Lee-authored Python tooling and other root-level original work are available
  under the [MIT License](LICENSE).
- The `desktop/` application is a derivative of drawDB and remains licensed
  under the [GNU AGPL v3](desktop/LICENSE).

The desktop application cannot be relicensed as MIT without permission from
all relevant drawDB copyright holders. See [LICENSE_SCOPE.md](LICENSE_SCOPE.md)
and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the exact boundary and
attributions.

Project demonstration: [ERD Tool](https://nginx.leebasehome.com/erd-tool/)
