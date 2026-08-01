# Context

## Snapshot

- Mode: 2, with explicit autonomous delivery authorization for this milestone.
- Current state: ERD Tool v0.1.0 source release merged to `main`; the macOS
  source release is unsigned and non-notarized.
- The completed Electron application is versioned in this repository under
  `desktop/`; the former sibling-repository runtime dependency is gone.
- Apple Silicon macOS is the validated release target. Linux and Windows
  packaging remain future release gates.
- The canonical model v1 is immutable, deterministic, credential-free, and
  supports namespaces, tables, ordered columns, mapped types, PK/UQ/FK
  constraints, relationships, defaults, and comments.
- The canonical Python CLI supports Snowflake DDL import/render, read-only
  SQLite introspection, strict project validation, and project serving.
- The desktop app supports canonical project files, ELK auto-layout, Snowflake
  DDL, machine-local profiles, live metadata browsing, and Snowflake reverse
  engineering. It also includes the reviewed conversational schema-authoring
  workflow with safeStorage-backed local API-key handling.
- Snowflake PK/UQ/FK constraints are emitted as informational `NOT ENFORCED`;
  ERD Tool never adds `RELY` automatically.
- Exact foundations: drawDB upstream base
  `b24ad20b6588b9b99609e8a03b87efa7b28cf245`; runtime `elkjs@0.11.1` with
  evaluated source pin `87f373f5697675f94de210f7d07170d7f2f97391` recorded in
  the fork. AGPL-3.0/EPL-2.0 notices and patch history are preserved.
- Local Snowflake and desktop connection credentials remain machine-local,
  encrypted or key-pair protected as appropriate, and excluded from projects,
  renderer persistence, logs, tests, and snapshots.

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
  Electron builds; the high/critical production dependency audit; ARM64 DMG/ZIP
  packaging; and a packaged-app Playwright launch showing the ERD Tool editor
  with Snowflake available.
- Added Databricks-specific contributor guidance, a proposal issue form, a
  fixture-backed Unity Catalog issue (#2), and provider-aware PR expectations.
- Merged the macOS release PR (#1) after reconciling it with `main`; the
  release decision remains unsigned and non-notarized.
- Rebuilt the lost SS-014 conversational schema-authoring feature in the
  `/Users/lee/projects/drawdb` desktop fork. The rebuild includes strict logical
  model proposals, OpenAI Responses API Structured Outputs, encrypted local API
  key handling, allowlisted Electron IPC, a docked review panel, canvas diffs,
  explicit Accept/Edit/Reject, and undo/redo plus save-state integration.
- Reverified the rebuilt desktop fork with 146/146 automated tests, ESLint,
  production desktop/Electron builds, the real browser workflow, a packaged
  Electron UI smoke, credential scanning, and `git diff --check`.
- Published the complete verified desktop feature set to drawDB `main` in
  commit `fbe78fa`, following the previously local Snowflake export commit
  `09d7860`.
- Reverse engineered the official Chinook SQLite database into 11 tables,
  64 columns, 11 keys/relationships, and a canonical ER project.
- Forward engineered the generated structure into live
  `ERD_TOOL_CHINOOK.PUBLIC`. Information Schema verified 11 tables, 64 columns,
  11 primary keys, 11 foreign keys, and zero enforced constraints.
- Exercised the real browser workflow: import, edit/rename, ELK layout, DDL
  preview, download, local persistence, reload, and a two-schema CLI-to-browser
  round trip.
- Repaired all material independent-review findings, including SQLite affinity
  and FK edges, quote-aware Snowflake defaults/comments, legal identifiers,
  cyclic FKs, multi-schema projection, validation parity, legacy projects,
  layout persistence/undo, and Snowflake type bounds/defaults.
- Verification is green: 119 Python tests; 46 drawDB unit tests; ESLint; Vite
  production build; real Playwright cross-repository flow; Agent-Orch doctor;
  live Snowflake metadata verification; and credential scans.
- Added the previously missing importable markdown-heading guidance API. The
  JSON-formatted `.yaml` playbook template is intentionally retained because
  JSON is valid YAML and the existing Agent-Orch/template references depend on
  that stable path.

### Decisions Locked

- Do not describe the desktop application as MIT. It is a drawDB derivative and
  must remain AGPL unless the relevant upstream copyright holders authorize a
  relicense.
- v0.1.0 is unsigned and not notarized. Signing/notarization is a later release
  decision, not a hidden claim in this source release.
- Structure engineering is the delivered boundary; row-data movement is not
  part of v0.1.0.

### Next Actions Queue

1. Invite a Databricks contributor to issue #2 and review the first fixture-backed
   reverse-engineering proposal.
2. Review the React Router major upgrade before any public binary distribution.
3. Keep v0.1.0 unsigned and non-notarized until a concrete public-binary
   distribution milestone justifies an owner-approved signing decision.
4. Validate Linux and Windows only when those platforms become active targets.
5. Row-data movement remains optional future work, not a hidden release blocker.
