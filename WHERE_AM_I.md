# Where Am I

## Milestone state

ERD Tool 0.1.0 is merged to `main` as an open-source Apple Silicon macOS
source release. The installable Electron app, canonical Python tooling, tests,
documentation, and release automation now live in one repository.

The product can reverse engineer SQLite and live Snowflake schemas, edit and
automatically arrange ER diagrams, save credential-free project files, and
generate Snowflake DDL. The proven Chinook gate remains 11 tables, 64 columns,
11 primary keys, 11 foreign keys, and zero enforced constraints.

Verification is green across 119 Python tests, 115 desktop tests, lint, all
production builds, the high/critical production npm audit gate, Apple Silicon
DMG/ZIP packaging, and a smoke launch of the packaged application. Two
moderate React Router advisories remain scheduled for compatibility review
before public binary distribution.

## License boundary

The root canonical tooling is MIT licensed. `desktop/` derives from drawDB and
is AGPL-3.0-only. The packaged application is therefore AGPL, not MIT.

## Next milestone

Invite a Databricks contributor to issue #2 and review the first fixture-backed
Unity Catalog reverse-engineering contribution. Keep signing/notarization
deferred until a concrete public-binary milestone; Linux and Windows remain
later release-validation targets.
