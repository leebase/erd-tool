# ERD Tool Desktop

This directory contains the Electron/React visual data modeling application for
ERD Tool. It is derived from [drawDB](https://github.com/drawdb-io/drawdb) and
adds canonical project files, Snowflake engineering, direct Snowflake metadata
connections, desktop file operations, and ELK automatic layout.

## Development

Use Node.js 22 or newer.

```bash
npm ci
npm run start:electron
```

Run the complete desktop source gate:

```bash
npm run verify:release
npm audit --omit=dev
```

Build an unsigned Apple Silicon release:

```bash
npm run dist:desktop:mac:arm64
```

Installers are written to `dist-installers/`. They are intentionally excluded
from Git. Version 0.1.0 is not signed or notarized.

## Snowflake

Connection profiles are machine-local and never belong in source control or
project files. Use a least-privileged role. The application supports password,
private-key, and external-browser authentication and can reverse engineer the
selected Snowflake database/schema into the editable canvas.

## Source and attribution

- Upstream: `drawdb-io/drawdb`
- Fork base: `b24ad20b6588b9b99609e8a03b87efa7b28cf245`
- Local changes: [ERD_TOOL_PATCHES.md](ERD_TOOL_PATCHES.md)
- Notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

This entire directory, including ERD Tool modifications, is licensed under
[GNU AGPL v3](LICENSE). It is not covered by the root MIT license.
