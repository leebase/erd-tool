"""SQLite schema introspection into the canonical physical model."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from erd_tool.model import (
    Column,
    DataType,
    Namespace,
    PhysicalModel,
    Relationship,
    Table,
    TableConstraint,
    column_id,
    constraint_id,
    namespace_id,
    relationship_id,
    table_id,
)

SNOWFLAKE_IDENTIFIER_MAX_LENGTH = 255
_VARCHAR_MAX = 16777216
_BINARY_MAX = 8388608

_TYPE_BOOLEAN_RE = re.compile(r"^(?:BOOLEAN|BOOL)$", re.IGNORECASE)
_TYPE_DATE_RE = re.compile(r"^DATE$", re.IGNORECASE)
_TYPE_DATETIME_RE = re.compile(r"^(?:DATETIME|TIMESTAMP)$", re.IGNORECASE)
_TYPE_NUMERIC_PARAMS_RE = re.compile(
    r"^(?:NUMERIC|DECIMAL|NUMBER)\s*\(\s*(?P<precision>\d+)\s*,\s*(?P<scale>\d+)\s*\)$",
    re.IGNORECASE,
)
_CHAR_LENGTH_RE = re.compile(r"\(\s*(?P<length>\d+)\s*\)")


class SQLiteImportError(ValueError):
    """Raised when a SQLite database cannot be imported into the canonical model."""


def import_sqlite_schema(
    path: str | Path,
    *,
    model_name: str,
    catalog: str,
    schema: str,
) -> PhysicalModel:
    """Import SQLite schema metadata into PhysicalModel v1."""

    if not isinstance(model_name, str) or not model_name.strip():
        raise SQLiteImportError("model_name must be a nonblank string")
    if not isinstance(catalog, str) or not catalog.strip():
        raise SQLiteImportError("catalog must be a nonblank string")
    if not isinstance(schema, str) or not schema.strip():
        raise SQLiteImportError("schema must be a nonblank string")

    database_path = Path(path)
    if not database_path.exists():
        raise SQLiteImportError(f"database path does not exist: {database_path}")
    if not database_path.is_file():
        raise SQLiteImportError(f"database path is not a readable file: {database_path}")

    catalog_name = normalize_snowflake_identifier(catalog, label="catalog")
    schema_name = normalize_snowflake_identifier(schema, label="schema")

    try:
        connection = sqlite3.connect(_readonly_sqlite_uri(database_path), uri=True)
    except sqlite3.Error as exc:
        raise SQLiteImportError(f"invalid sqlite database: {exc}") from exc

    try:
        try:
            connection.row_factory = sqlite3.Row
            table_rows = connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            ).fetchall()
        except sqlite3.Error as exc:
            raise SQLiteImportError(f"invalid sqlite database: {exc}") from exc
        if not table_rows:
            raise SQLiteImportError("database has no user tables")

        raw_table_names = [str(row["name"]) for row in table_rows]
        normalized_tables = _normalize_unique_names(raw_table_names, label="table")

        built_tables: list[Table] = []
        raw_to_normalized = dict(zip(raw_table_names, normalized_tables, strict=True))
        raw_table_fold = _casefold_lookup(raw_table_names, label="table")
        table_column_folds: dict[str, dict[str, str]] = {}
        table_column_normalized: dict[str, dict[str, str]] = {}
        table_pk_columns: dict[str, tuple[str, ...]] = {}

        for raw_name, normalized_name in zip(
            raw_table_names, normalized_tables, strict=True
        ):
            built_tables.append(
                _build_table(
                    connection,
                    raw_table_name=raw_name,
                    table_name=normalized_name,
                    catalog=catalog_name,
                    schema=schema_name,
                    raw_to_normalized=raw_to_normalized,
                    raw_table_fold=raw_table_fold,
                    table_column_folds=table_column_folds,
                    table_column_normalized=table_column_normalized,
                    table_pk_columns=table_pk_columns,
                )
            )

        built_tables.sort(key=lambda item: item.id)
        relationships = _relationships_from_tables(built_tables, catalog_name, schema_name)
        namespace = Namespace(
            id=namespace_id(catalog_name, schema_name),
            catalog=catalog_name,
            schema=schema_name,
        )
        try:
            return PhysicalModel(
                name=model_name,
                model_version="1",
                namespaces=(namespace,),
                tables=tuple(built_tables),
                relationships=relationships,
            )
        except ValueError as exc:
            raise SQLiteImportError(str(exc)) from exc
    finally:
        connection.close()


def normalize_snowflake_identifier(raw: str, *, label: str = "identifier") -> str:
    """Normalize a name to a legal unquoted Snowflake identifier."""

    if not isinstance(raw, str):
        raise SQLiteImportError(f"{label} must be a string")
    chars: list[str] = []
    for char in raw:
        # Per-character ASCII fold only — never whole-string upper(), which can
        # expand Unicode (e.g. ß -> SS) and change length/collision behavior.
        if "a" <= char <= "z":
            chars.append(char.upper())
        elif ("A" <= char <= "Z") or ("0" <= char <= "9") or char in {"_", "$"}:
            chars.append(char)
        else:
            chars.append("_")
    normalized = "".join(chars)
    if normalized and normalized[0] not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ_":
        normalized = f"_{normalized}"
    if not normalized:
        raise SQLiteImportError(f"{label} normalizes to an empty identifier: {raw!r}")
    if len(normalized) > SNOWFLAKE_IDENTIFIER_MAX_LENGTH:
        raise SQLiteImportError(
            f"{label} exceeds Snowflake's {SNOWFLAKE_IDENTIFIER_MAX_LENGTH}-character limit"
        )
    return normalized


def _readonly_sqlite_uri(database_path: Path) -> str:
    """Build a read-only SQLite URI that safely encodes #, ?, and % in paths."""

    uri = database_path.resolve().as_uri()
    separator = "&" if "?" in uri else "?"
    return f"{uri}{separator}mode=ro"


def map_sqlite_declared_type(declared_type: str | None) -> DataType:
    """Map a SQLite declared type to a canonical Snowflake-safe DataType.

    Explicit DATE/DATETIME/BOOLEAN mappings are retained. All other declarations
    follow SQLite's documented type-affinity classification, preserving char
    lengths and NUMERIC(p,s) when safe. An empty declared type uses BLOB affinity.
    """

    token = " ".join((declared_type or "").split())
    upper = token.upper()

    try:
        if _TYPE_BOOLEAN_RE.match(token):
            return DataType(
                family="BOOLEAN",
                text="BOOLEAN",
                precision=None,
                scale=None,
                length=None,
            )
        if _TYPE_DATE_RE.match(token):
            return DataType(
                family="DATE",
                text="DATE",
                precision=None,
                scale=None,
                length=None,
            )
        if _TYPE_DATETIME_RE.match(token):
            return DataType(
                family="TIMESTAMP_NTZ",
                text="TIMESTAMP_NTZ(9)",
                precision=9,
                scale=None,
                length=None,
            )

        # SQLite affinity rules (documented order), including empty -> BLOB.
        if not token:
            return DataType(
                family="BINARY",
                text=f"BINARY({_BINARY_MAX})",
                precision=None,
                scale=None,
                length=_BINARY_MAX,
            )
        if "INT" in upper:
            return DataType(
                family="NUMBER",
                text="NUMBER(38, 0)",
                precision=38,
                scale=0,
                length=None,
            )
        if "CHAR" in upper or "CLOB" in upper or "TEXT" in upper:
            length_match = _CHAR_LENGTH_RE.search(token)
            if length_match is not None:
                length = int(length_match.group("length"))
                return DataType(
                    family="VARCHAR",
                    text=f"VARCHAR({length})",
                    precision=None,
                    scale=None,
                    length=length,
                )
            return DataType(
                family="VARCHAR",
                text=f"VARCHAR({_VARCHAR_MAX})",
                precision=None,
                scale=None,
                length=_VARCHAR_MAX,
            )
        if "BLOB" in upper:
            return DataType(
                family="BINARY",
                text=f"BINARY({_BINARY_MAX})",
                precision=None,
                scale=None,
                length=_BINARY_MAX,
            )
        if "REAL" in upper or "FLOA" in upper or "DOUB" in upper:
            return DataType(
                family="FLOAT",
                text="FLOAT",
                precision=None,
                scale=None,
                length=None,
            )

        # NUMERIC affinity
        numeric_match = _TYPE_NUMERIC_PARAMS_RE.match(token)
        if numeric_match is not None:
            precision = int(numeric_match.group("precision"))
            scale = int(numeric_match.group("scale"))
            return DataType(
                family="NUMBER",
                text=f"NUMBER({precision}, {scale})",
                precision=precision,
                scale=scale,
                length=None,
            )
        return DataType(
            family="NUMBER",
            text="NUMBER(38, 0)",
            precision=38,
            scale=0,
            length=None,
        )
    except ValueError as exc:
        raise SQLiteImportError(str(exc)) from exc


def _normalize_unique_names(raw_names: list[str], *, label: str) -> list[str]:
    normalized: list[str] = []
    seen: dict[str, str] = {}
    for raw in raw_names:
        value = normalize_snowflake_identifier(raw, label=label)
        if value in seen:
            raise SQLiteImportError(
                f"{label} name collision after normalization: "
                f"{seen[value]!r} and {raw!r} both become {value}"
            )
        seen[value] = raw
        normalized.append(value)
    return normalized


def _casefold_lookup(raw_names: list[str], *, label: str) -> dict[str, str]:
    """Map casefolded raw identifier -> original raw identifier."""

    lookup: dict[str, str] = {}
    for raw in raw_names:
        key = raw.casefold()
        if key in lookup and lookup[key] != raw:
            raise SQLiteImportError(
                f"{label} case-insensitive collision: {lookup[key]!r} and {raw!r}"
            )
        lookup[key] = raw
    return lookup


def _build_table(
    connection: sqlite3.Connection,
    *,
    raw_table_name: str,
    table_name: str,
    catalog: str,
    schema: str,
    raw_to_normalized: dict[str, str],
    raw_table_fold: dict[str, str],
    table_column_folds: dict[str, dict[str, str]],
    table_column_normalized: dict[str, dict[str, str]],
    table_pk_columns: dict[str, tuple[str, ...]],
) -> Table:
    column_rows = connection.execute(
        f'PRAGMA table_info("{_escape_ident(raw_table_name)}")'
    ).fetchall()
    if not column_rows:
        raise SQLiteImportError(f"table {raw_table_name!r} has malformed column metadata")

    raw_column_names = [str(row["name"]) for row in column_rows]
    normalized_columns = _normalize_unique_names(raw_column_names, label="column")
    raw_column_to_normalized = dict(
        zip(raw_column_names, normalized_columns, strict=True)
    )
    raw_column_fold = _casefold_lookup(raw_column_names, label="column")
    table_column_folds[raw_table_name] = raw_column_fold
    table_column_normalized[raw_table_name] = raw_column_to_normalized

    pk_ordinals = {
        int(row["pk"]): raw_column_to_normalized[str(row["name"])]
        for row in column_rows
        if int(row["pk"]) > 0
    }
    pk_columns = tuple(pk_ordinals[key] for key in sorted(pk_ordinals))
    table_pk_columns[raw_table_name] = pk_columns

    columns: list[Column] = []
    for ordinal, (row, column_name) in enumerate(
        zip(column_rows, normalized_columns, strict=True), start=1
    ):
        nullable = int(row["notnull"]) == 0
        if column_name in pk_columns:
            nullable = False
        default = _normalize_default(row["dflt_value"])
        try:
            data_type = map_sqlite_declared_type(row["type"])
        except SQLiteImportError as exc:
            raise SQLiteImportError(
                f"table {raw_table_name!r} column {row['name']!r}: {exc}"
            ) from exc
        columns.append(
            Column(
                id=column_id(catalog, schema, table_name, column_name),
                name=column_name,
                ordinal=ordinal,
                data_type=data_type,
                nullable=nullable,
                default=default,
                comment=None,
            )
        )

    constraints: list[TableConstraint] = []
    used_constraint_names: set[str] = set()

    if pk_columns:
        pk_name = _allocate_constraint_name(
            f"PK_{table_name}",
            used_constraint_names,
            label=f"primary key on {table_name}",
        )
        constraints.append(
            TableConstraint(
                id=constraint_id(catalog, schema, table_name, pk_name),
                name=pk_name,
                kind="primary_key",
                columns=tuple(
                    column_id(catalog, schema, table_name, name) for name in pk_columns
                ),
                referenced_table_id=None,
                referenced_columns=(),
            )
        )

    unique_ordinal = 0
    index_rows = connection.execute(
        f'PRAGMA index_list("{_escape_ident(raw_table_name)}")'
    ).fetchall()
    for index_row in index_rows:
        if int(index_row["unique"]) != 1:
            continue
        origin = str(index_row["origin"] or "")
        if origin == "pk":
            continue
        index_name = str(index_row["name"])
        if "partial" in index_row.keys() and int(index_row["partial"]) == 1:
            raise SQLiteImportError(
                f"partial unique index is not supported: {index_name!r}"
            )
        index_info = connection.execute(
            f'PRAGMA index_info("{_escape_ident(index_name)}")'
        ).fetchall()
        if not index_info:
            raise SQLiteImportError(
                f"malformed unique index metadata for {index_name!r}"
            )
        unique_columns = []
        for info in sorted(index_info, key=lambda item: int(item["seqno"])):
            raw_column = str(info["name"])
            folded = raw_column.casefold()
            if folded not in raw_column_fold:
                raise SQLiteImportError(
                    f"unique index {index_name!r} references unknown column {raw_column!r}"
                )
            unique_columns.append(
                raw_column_to_normalized[raw_column_fold[folded]]
            )
        unique_ordinal += 1
        unique_name = _allocate_constraint_name(
            f"UQ_{table_name}_{unique_ordinal}",
            used_constraint_names,
            label=f"unique constraint on {table_name}",
        )
        constraints.append(
            TableConstraint(
                id=constraint_id(catalog, schema, table_name, unique_name),
                name=unique_name,
                kind="unique",
                columns=tuple(
                    column_id(catalog, schema, table_name, name)
                    for name in unique_columns
                ),
                referenced_table_id=None,
                referenced_columns=(),
            )
        )

    fk_rows = connection.execute(
        f'PRAGMA foreign_key_list("{_escape_ident(raw_table_name)}")'
    ).fetchall()
    fk_groups: dict[int, list[sqlite3.Row]] = {}
    for row in fk_rows:
        fk_groups.setdefault(int(row["id"]), []).append(row)

    for fk_id in sorted(fk_groups):
        group = sorted(fk_groups[fk_id], key=lambda item: int(item["seq"]))
        raw_target_token = str(group[0]["table"])
        target_fold = raw_target_token.casefold()
        if target_fold not in raw_table_fold:
            raise SQLiteImportError(
                f"unresolved foreign key reference {raw_target_token} "
                f"from table {raw_table_name}"
            )
        raw_target = raw_table_fold[target_fold]
        target_table = raw_to_normalized[raw_target]

        local_columns: list[str] = []
        for row in group:
            raw_from = str(row["from"])
            from_fold = raw_from.casefold()
            if from_fold not in raw_column_fold:
                raise SQLiteImportError(
                    f"foreign key references unknown local column {raw_from!r}"
                )
            local_columns.append(
                raw_column_to_normalized[raw_column_fold[from_fold]]
            )

        referenced_columns = _resolve_fk_target_columns(
            group,
            raw_table_name=raw_table_name,
            raw_target=raw_target,
            target_table=target_table,
            table_column_folds=table_column_folds,
            table_column_normalized=table_column_normalized,
            table_pk_columns=table_pk_columns,
            connection=connection,
            catalog=catalog,
            schema=schema,
        )

        fk_name = _allocate_constraint_name(
            f"FK_{table_name}_{target_table}_{fk_id + 1}",
            used_constraint_names,
            label=f"foreign key on {table_name}",
        )
        constraints.append(
            TableConstraint(
                id=constraint_id(catalog, schema, table_name, fk_name),
                name=fk_name,
                kind="foreign_key",
                columns=tuple(
                    column_id(catalog, schema, table_name, name)
                    for name in local_columns
                ),
                referenced_table_id=table_id(catalog, schema, target_table),
                referenced_columns=tuple(
                    column_id(catalog, schema, target_table, name)
                    for name in referenced_columns
                ),
            )
        )

    constraints.sort(key=lambda item: item.id)
    return Table(
        id=table_id(catalog, schema, table_name),
        namespace_id=namespace_id(catalog, schema),
        name=table_name,
        kind="table",
        columns=tuple(columns),
        constraints=tuple(constraints),
        comment=None,
    )


def _ensure_target_column_metadata(
    connection: sqlite3.Connection,
    *,
    raw_target: str,
    table_column_folds: dict[str, dict[str, str]],
    table_column_normalized: dict[str, dict[str, str]],
    table_pk_columns: dict[str, tuple[str, ...]],
) -> None:
    if raw_target in table_column_folds:
        return
    column_rows = connection.execute(
        f'PRAGMA table_info("{_escape_ident(raw_target)}")'
    ).fetchall()
    if not column_rows:
        raise SQLiteImportError(
            f"table {raw_target!r} has malformed column metadata"
        )
    raw_column_names = [str(row["name"]) for row in column_rows]
    normalized_columns = _normalize_unique_names(raw_column_names, label="column")
    raw_column_to_normalized = dict(
        zip(raw_column_names, normalized_columns, strict=True)
    )
    table_column_folds[raw_target] = _casefold_lookup(
        raw_column_names, label="column"
    )
    table_column_normalized[raw_target] = raw_column_to_normalized
    pk_ordinals = {
        int(row["pk"]): raw_column_to_normalized[str(row["name"])]
        for row in column_rows
        if int(row["pk"]) > 0
    }
    table_pk_columns[raw_target] = tuple(
        pk_ordinals[key] for key in sorted(pk_ordinals)
    )


def _resolve_fk_target_columns(
    group: list[sqlite3.Row],
    *,
    raw_table_name: str,
    raw_target: str,
    target_table: str,
    table_column_folds: dict[str, dict[str, str]],
    table_column_normalized: dict[str, dict[str, str]],
    table_pk_columns: dict[str, tuple[str, ...]],
    connection: sqlite3.Connection,
    catalog: str,
    schema: str,
) -> list[str]:
    _ensure_target_column_metadata(
        connection,
        raw_target=raw_target,
        table_column_folds=table_column_folds,
        table_column_normalized=table_column_normalized,
        table_pk_columns=table_pk_columns,
    )
    target_fold = table_column_folds[raw_target]
    target_normalized = table_column_normalized[raw_target]

    raw_tos = [row["to"] for row in group]
    omitted = [value is None for value in raw_tos]
    if any(omitted) and not all(omitted):
        raise SQLiteImportError(
            f"foreign key on {raw_table_name!r} has a malformed mix of "
            f"explicit and omitted referenced columns for {raw_target!r}"
        )

    if all(omitted):
        pk_columns = table_pk_columns.get(raw_target, ())
        if not pk_columns:
            raise SQLiteImportError(
                f"foreign key on {raw_table_name!r} omits referenced columns but "
                f"target {raw_target!r} has no primary key"
            )
        if len(pk_columns) != len(group):
            raise SQLiteImportError(
                f"foreign key on {raw_table_name!r} arity {len(group)} does not "
                f"match primary key arity {len(pk_columns)} on {raw_target!r}"
            )
        return list(pk_columns)

    referenced_columns: list[str] = []
    for raw_to in raw_tos:
        # Never coerce SQL NULL into the identifier "NONE".
        if raw_to is None:
            raise SQLiteImportError(
                f"foreign key on {raw_table_name!r} has a null referenced column"
            )
        raw_to_name = str(raw_to)
        to_fold = raw_to_name.casefold()
        if to_fold not in target_fold:
            raise SQLiteImportError(
                "unresolved foreign key column "
                f"{catalog}.{schema}.{target_table}.{raw_to_name}"
            )
        referenced_columns.append(target_normalized[target_fold[to_fold]])
    return referenced_columns



def _relationships_from_tables(
    tables: list[Table], catalog: str, schema: str
) -> tuple[Relationship, ...]:
    relationships: list[Relationship] = []
    for table in tables:
        for constraint in table.constraints:
            if constraint.kind != "foreign_key":
                continue
            assert constraint.name is not None
            relationships.append(
                Relationship(
                    id=relationship_id(catalog, schema, table.name, constraint.name),
                    name=constraint.name,
                    source_table_id=table.id,
                    source_column_ids=constraint.columns,
                    target_table_id=constraint.referenced_table_id or "",
                    target_column_ids=constraint.referenced_columns,
                    cardinality="many_to_one",
                )
            )
    relationships.sort(key=lambda item: item.id)
    return tuple(relationships)


def _allocate_constraint_name(
    candidate: str, used: set[str], *, label: str
) -> str:
    name = normalize_snowflake_identifier(candidate, label=label)
    if len(name) > SNOWFLAKE_IDENTIFIER_MAX_LENGTH:
        raise SQLiteImportError(
            f"{label} constraint name exceeds Snowflake's "
            f"{SNOWFLAKE_IDENTIFIER_MAX_LENGTH}-character limit"
        )
    if name in used:
        raise SQLiteImportError(f"constraint name collision: {name}")
    used.add(name)
    return name


def _normalize_default(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text


def _escape_ident(value: str) -> str:
    return value.replace('"', '""')
