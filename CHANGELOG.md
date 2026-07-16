# Changelog

All notable changes to ERD Tool are documented here.

## [0.1.0] - 2026-07-15

### Added

- Native Electron application for Apple Silicon macOS.
- SQLite reverse engineering into a canonical ERD project.
- Live Snowflake profile management, connection testing, metadata browsing, and
  schema reverse engineering.
- Snowflake forward engineering with deterministic DDL and informational
  constraints.
- Editable drawDB-based diagram canvas with ELK automatic layout.
- Local, credential-free project save and reopen workflows.
- Reproducible CI and a manual unsigned macOS packaging workflow.

### Proven

- Chinook round trip with 11 tables, 64 columns, 11 primary keys, and 11
  foreign keys in Snowflake.
- Desktop unit/integration suite, lint, renderer build, Electron build, and
  Apple Silicon packaging.

### Known limitations

- macOS packages are unsigned and not notarized.
- Linux and Windows are planned but are not validated release targets yet.
- The release moves database structure, not table row data.

[0.1.0]: https://github.com/leebase/erd-tool/releases/tag/v0.1.0
