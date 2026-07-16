# Context

## Snapshot

- Current state: ERD Tool v0.1.0 source release candidate on branch
  `agent/open-source-mac-release`.
- The completed Electron application is now versioned in this repository under
  `desktop/`; the former sibling-repository runtime dependency is gone.
- Apple Silicon macOS is the validated release target. Linux and Windows
  packaging remain future release gates.
- The canonical Python model/CLI is MIT licensed. The drawDB-derived desktop
  application remains AGPL-3.0-only. `LICENSE_SCOPE.md` documents the boundary.
- The canonical model is deterministic and credential-free. The desktop app
  supports local project files, ELK layout, Snowflake DDL, machine-local
  Snowflake profiles, live metadata browsing, and Snowflake reverse engineering.
- Snowflake PK/UQ/FK constraints are emitted as informational `NOT ENFORCED`;
  ERD Tool never adds `RELY` automatically.

## What's Happening Now

### Recently Completed

- Consolidated the modified drawDB application into `desktop/` with its AGPL
  license, upstream attribution, patch history, and third-party notices.
- Branded the Electron package as ERD Tool 0.1.0 and added in-app links to
  source and license notices.
- Added a root MIT license for original canonical tooling plus explicit public
  licensing, security, contribution, conduct, changelog, and release docs.
- Added Python/desktop CI, Dependabot, and an unsigned Apple Silicon packaging
  workflow.
- Made tutorials portable and removed all development-machine paths from
  public getting-started instructions.
- Validated 119 Python tests; 115 desktop tests; lint; web, desktop, and
  Electron builds; zero production dependency vulnerabilities; ARM64 DMG/ZIP
  packaging; and a packaged-app Playwright launch showing the ERD Tool editor
  with Snowflake available.

### Decisions Locked

- Do not describe the desktop application as MIT. It is a drawDB derivative and
  must remain AGPL unless the relevant upstream copyright holders authorize a
  relicense.
- v0.1.0 is unsigned and not notarized. Signing/notarization is a later release
  decision, not a hidden claim in this source release.
- Structure engineering is the delivered boundary; row-data movement is not
  part of v0.1.0.

### Next Actions Queue

1. Review and merge the open-source Mac release pull request.
2. Decide whether the first downloadable public binary should be signed and
   notarized before publishing a GitHub release.
3. Validate Linux and Windows only when those platforms become active targets.
