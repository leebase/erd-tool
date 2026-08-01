# ERD Tool Patch History

## Foundation

- Upstream: https://github.com/drawdb-io/drawdb
- Public source: https://github.com/leebase/erd-tool/tree/main/desktop
- Fork base: `b24ad20b6588b9b99609e8a03b87efa7b28cf245`
- License: GNU AGPL-3.0; the upstream `LICENSE` remains unchanged.

## 2026-07-10 — Canonical project and Snowflake integration

- Added strict canonical-project adapters while retaining drawDB's existing
  React editor, table/field editor, relationship canvas, drag behavior, and
  browser-local persistence.
- Added Snowflake as an editor database choice with the canonical type families
  used by ERD Tool.
- Added project open/save, automatic layout, and informational Snowflake DDL
  actions to the existing editor header.
- Added deterministic adapter and real-layout tests using Node's built-in test
  runner.
- Added `elkjs` as the automatic layout runtime.

The evaluated elkjs source reference was
`87f373f5697675f94de210f7d07170d7f2f97391` (upstream version `0.12.0`). That
commit does not publish a runnable npm artifact, and a clean local build failed
inside upstream Xtext generation. The runtime therefore uses exact published
package `elkjs@0.11.1`, corresponding to upstream tag commit
`572e73323791d05f09b0815ff639af2b67f202ab`. No compiled files from different
versions are mixed, and there is no networked postinstall workaround.

Future elkjs upgrades must use one reproducible published or locally built
artifact, rerun `src/erdTool/elkLayout.test.js`, and update this record.

## 2026-07-15 — Electron and live Snowflake release

- Added a sandboxed Electron main/preload process with local project open/save,
  DDL export, external-navigation controls, and native auto-arrange command.
- Added machine-local Snowflake profiles with password, key-pair, and external-
  browser authentication, connection testing, metadata browsing, and schema
  reverse engineering.
- Added deterministic metadata-to-diagram conversion and live-connection tests
  that use injected drivers rather than committed credentials.
- Added macOS, Linux, and Windows packaging definitions; v0.1.0 validates only
  unsigned Apple Silicon macOS artifacts.
- Renamed the packaged product to ERD Tool and added in-app links to complete
  corresponding source, licensing, and notices.
- Consolidated the desktop fork into `leebase/erd-tool/desktop` so the shipped
  source and release documentation are versioned together.
