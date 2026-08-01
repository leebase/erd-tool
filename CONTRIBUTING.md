# Contributing to ERD Tool

Thank you for helping make ERD Tool a useful, local-first database modeling
studio. Small fixes, test improvements, documentation, provider integrations,
and careful product feedback are all welcome.

For a large change, open an issue first. The issue should explain the user
problem, the proposed scope, the affected database/provider, and how the
change can be tested without credentials. This gives contributors a concrete
starting point and lets maintainers resolve architecture and licensing
questions before implementation begins.

## First contribution

1. Fork or clone the repository.
2. Read [LICENSE_SCOPE.md](LICENSE_SCOPE.md) and the relevant architecture
   contract before moving code between the Python and desktop boundaries.
3. Look for an existing issue, or open one using the repository's issue form.
4. Create a focused branch from `main`.
5. Make the smallest change that proves the behavior, including deterministic
   tests and documentation where appropriate.
6. Run the checks below and include their results in the pull request.

Please do not include credentials, private keys, connection profiles, tokens,
generated installers, `node_modules`, local database files, customer data, or
machine-specific paths in commits, fixtures, screenshots, or logs.

## Development setup

The canonical Python tooling and the Electron desktop application have separate
dependency sets.

### Python canonical tooling

Use Python 3.11 or newer:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m pytest
```

The Python package owns the provider-neutral `PhysicalModel`, deterministic
project serialization, SQLite introspection, and the constrained Snowflake
fixture/DDL workflows. It must remain credential-free and offline-first.

### Electron desktop application

Use Node.js 22 or newer:

```bash
cd desktop
npm ci
npm run verify:release
npm run start:electron
```

The desktop app is the product editor. Its provider adapters, metadata mapping,
DDL import/export, and Electron connection services must preserve existing
SQLite and Snowflake behavior. Do not make Python a runtime dependency of the
desktop application.

## Databricks contributions

Databricks support is an active contributor opportunity. Start with
[the Databricks support guide](docs/contributing/databricks-support.md) and the
`Databricks support proposal` issue form.

The first useful slice is offline-first reverse engineering for Databricks SQL
and Unity Catalog metadata. A good contribution should prove a narrow,
fixture-backed path from provider metadata into the canonical physical model
and, where applicable, into the editable diagram. Do not begin by adding a
second schema graph or by requiring a live workspace in CI.

When proposing Databricks support, state the exact cloud/runtime surface and
objects involved. Databricks metadata and constraint availability vary by
Unity Catalog, runtime, and feature maturity, so unsupported objects must be
reported clearly instead of silently dropped.

The expected contribution shape is:

- sanitized or synthetic metadata fixtures committed under `docs/fixtures/` or
  a focused desktop test fixture;
- deterministic mapping into the provider-neutral `PhysicalModel` or the
  desktop adapter's canonical project shape;
- explicit type and object coverage, with unsupported cases failing loudly;
- tests for namespaces, table/column order, nullability, comments, keys, and
  relationships when those semantics are present;
- no accounts, workspace URLs, tokens, PATs, client secrets, SQL warehouse
  identifiers, or session data in the project model or fixture; and
- documentation of the exact checks and the Databricks documentation version or
  URL used to define the behavior.

The initial Databricks slice should preserve informational constraint semantics
and must not claim enforcement unless a separately tested provider contract
supports that claim. Forward DDL, live connection profiles, views, volumes,
managed/external table distinctions, Delta-specific features, and broader
Unity Catalog objects should be separate, explicitly scoped follow-up work.

## Checks before a pull request

For Python-only changes:

```bash
python -m pytest
```

For desktop changes:

```bash
cd desktop
npm run test
npm run lint
npm run build
npm run build:desktop
```

For a release-shaped desktop change, also run:

```bash
npm run verify:release
npm audit --omit=dev --audit-level=high
```

If a check cannot run in your environment, say why in the pull request and
provide the closest deterministic alternative. Live Snowflake or Databricks
access is opt-in and is never required for the default contributor gate. A
major React Router upgrade is a tracked compatibility follow-up; do not apply
`npm audit fix --force` without testing the desktop application.

## Pull requests

Keep each pull request focused. The description should include:

- the user problem and the exact scope;
- files or modules changed;
- tests and commands run, including results;
- fixture provenance and any provider/runtime assumptions;
- screenshots or a short recording for visual changes; and
- known limitations or follow-up work.

Reviewers will check correctness, regression safety, credential handling,
canonical-model discipline, documentation, and the applicable license boundary.

## Licensing contributions

Contributions to the root MIT-licensed tooling are submitted under MIT.
Contributions under `desktop/` are submitted under AGPL-3.0-only because that
application derives from drawDB. By submitting a contribution, you represent
that you have the right to license it under the applicable repository license.

See [LICENSE_SCOPE.md](LICENSE_SCOPE.md) before moving code across this boundary.

## Community standards

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security
vulnerabilities privately using [SECURITY.md](SECURITY.md), never in a public
issue.
