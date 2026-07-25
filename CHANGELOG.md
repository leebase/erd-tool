# Changelog

All notable changes to ERD Tool are documented here.

## [0.1.0] - 2026-07-15

### Added

- Native Electron application for Apple Silicon macOS.
- SQLite reverse engineering into a canonical ERD project.
- Live Snowflake profile management, connection testing, metadata browsing, and
  schema reverse engineering.
- Reusable SQLite and Snowflake connection profiles with locally protected
  secrets.
- Snowflake forward engineering with deterministic DDL and informational
  constraints.
- Snowflake Terraform HCL import, editable diagram projection, and deterministic
  HCL export without state ingestion or automatic apply.
- Governed natural-language schema proposals with visible diffs and explicit
  Edit, Accept, and Reject controls.
- Editable drawDB-based diagram canvas with ELK automatic layout.
- Local, credential-free project save and reopen workflows.
- Reproducible CI plus unsigned macOS, Linux AppImage, and Windows
  NSIS/portable packaging workflows.

### Proven

- Chinook round trip with 11 tables, 64 columns, 11 primary keys, and 11
  foreign keys in Snowflake.
- 146 desktop tests, 115 Python tests, lint, renderer build, Electron build,
  Apple Silicon packaging, and Windows x64 packaging.

### Known limitations

- macOS packages are unsigned and not notarized.
- Linux and Windows packaging is available, but those operating systems are not
  validated public release targets yet.
- The production dependency audit reports two moderate React Router advisories;
  the available npm fix requires a breaking major-version upgrade.
- The release moves database structure, not table row data.

[0.1.0]: https://github.com/leebase/erd-tool/releases/tag/v0.1.0
