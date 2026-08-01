# Where Am I

## Milestone state

ERD Tool 0.1.0 is code-complete as an open-source Apple Silicon macOS source
release candidate. The installable Electron app, canonical Python tooling,
tests, documentation, and release automation now live in one repository.

The product can reverse engineer SQLite and live Snowflake schemas, edit and
automatically arrange ER diagrams, save credential-free project files, and
generate Snowflake DDL. The proven Chinook gate remains 11 tables, 64 columns,
11 primary keys, 11 foreign keys, and zero enforced constraints.

Verification is green across 119 Python tests, 115 desktop tests, lint, all
production builds, a zero-vulnerability production npm audit, Apple Silicon
DMG/ZIP packaging, and a smoke launch of the packaged application.

## License boundary

The root canonical tooling is MIT licensed. `desktop/` derives from drawDB and
is AGPL-3.0-only. The packaged application is therefore AGPL, not MIT.

## Next milestone

Merge the open-source release pull request. Then choose whether to invest in
Apple signing/notarization or move next to Linux/Windows release validation.
