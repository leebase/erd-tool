# Contributing to ERD Tool

Thank you for improving ERD Tool. Please open an issue before a large change so
the design and licensing boundary can be agreed on early.

## Development setup

Python tooling:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
pytest
```

Desktop application:

```bash
cd desktop
npm ci
npm run verify:release
npm run start:electron
```

Before submitting a pull request, run both test suites and explain any user-
visible behavior change. Never commit credentials, private keys, connection
profiles, generated installers, `node_modules`, or local database files.

## Licensing contributions

Contributions to the root MIT-licensed tooling are submitted under MIT.
Contributions under `desktop/` are submitted under AGPL-3.0-only because that
application derives from drawDB. By submitting a contribution, you represent
that you have the right to license it under the applicable repository license.

See [LICENSE_SCOPE.md](LICENSE_SCOPE.md) before moving code across this boundary.
