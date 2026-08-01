# Databricks Support Contribution Guide

Databricks support is a contributor-led product opportunity. This document
defines a safe first slice so a contribution can land incrementally without
turning provider-specific metadata into a second canonical model.

## First slice: offline reverse engineering

The recommended first contribution targets Databricks SQL and Unity Catalog
metadata for accessible catalogs, schemas, and permanent tables. It should
produce a deterministic, editable ER model from sanitized or synthetic fixture
rows. It does not need a live Databricks workspace, a Databricks token, or a
cloud service in CI.

The first slice should cover only the objects and fields that can be represented
faithfully by the current canonical model:

- catalog and schema namespaces;
- permanent table identity and a deliberate policy for views or other relation
  types;
- ordered column names, data types, and nullability;
- comments or descriptions when the source exposes them; and
- primary, unique, and foreign-key metadata when it is available and in scope.

Databricks constraints are metadata unless a tested provider contract proves
otherwise. Preserve that distinction in the canonical model, generated DDL,
and user-facing documentation.

## Required architecture

The canonical physical model remains the source of truth:

```text
Databricks metadata -> provider adapter -> PhysicalModel -> project/diagram
```

Do not store Databricks workspace state, credentials, tokens, SQL warehouse
identifiers, sessions, or provider-native blobs in a project file. Do not make
Python a runtime dependency of the Electron application. Desktop product code
belongs under `desktop/src/erdTool/` or the narrowly relevant Electron service;
the Python package remains the reference/tooling boundary.

Stable identifiers and ordering must be deterministic. Catalog/schema/table
containment should use the same canonical namespace and table-id discipline as
the existing model. Column order is semantic and must not be replaced by
alphabetical sorting.

## Fixture and test contract

Begin with a small fixture containing at least two related tables in one Unity
Catalog namespace. The fixture should make the following observable:

1. catalog and schema map to one canonical namespace;
2. table and column IDs are stable across repeated runs;
3. ordinal column order is preserved;
4. supported Databricks types map explicitly to the canonical type boundary;
5. nullability, comments, and supported key metadata are preserved; and
6. project serialization contains no credentials, workspace paths, or session
   fields.

Unsupported types, relation kinds, constraints, or metadata shapes should fail
with a useful error or be excluded by an explicit documented policy. Silent
degradation to `VARCHAR`, dropped relationships, and guessed enforcement
semantics are not acceptable.

The default checks must remain offline:

```bash
python -m pytest
cd desktop
npm run test
npm run lint
npm run build
npm run build:desktop
```

Add a live Databricks acceptance check only as an opt-in, separately documented
workflow. It must never become the default pull-request gate and must never
require contributors to commit credentials.

## Databricks questions to resolve in the issue

Before implementation, record:

- Databricks cloud and runtime/SQL warehouse versions tested;
- Unity Catalog versus `hive_metastore` scope;
- managed, external, Delta, view, materialized-view, and streaming-table
  policy;
- exact metadata queries or API endpoints and their required privileges;
- supported data types and any lossy mappings;
- whether comments, defaults, generated columns, partitioning, clustering, or
  constraints are in the first slice; and
- whether the contribution is reverse engineering only or also forward DDL.

Databricks' Information Schema and constraint surfaces vary by Unity Catalog,
runtime, preview/GA status, and privileges. Use the official documentation for
the exact surface being implemented:

- [TABLES](https://docs.databricks.com/aws/en/sql/language-manual/information-schema/tables)
- [COLUMNS](https://docs.databricks.com/aws/en/sql/language-manual/information-schema/columns)
- [TABLE_CONSTRAINTS](https://docs.databricks.com/aws/en/sql/language-manual/information-schema/table_constraints)
- [KEY_COLUMN_USAGE](https://docs.databricks.com/aws/en/sql/language-manual/information-schema/key_column_usage)
- [Databricks constraints](https://docs.databricks.com/aws/en/tables/constraints)

## Suggested first contribution

Open the Databricks support issue, attach or describe a sanitized fixture, and
propose the smallest reverse-engineering slice. A strong first pull request
usually contains the fixture, adapter/mapping code, focused tests, a short
README or guide update, and an explicit list of unsupported cases. Keep forward
DDL, live authentication, and broad Unity Catalog coverage for follow-up
issues unless the initial scope is expanded and reviewed.
