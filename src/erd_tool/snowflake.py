"""Constrained Snowflake DDL import and deterministic rendering for v1."""

from __future__ import annotations

import re
from dataclasses import dataclass

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


class SnowflakeDDLImportError(ValueError):
    """Raised when Snowflake DDL cannot be imported into the canonical model."""


_IDENT = r"[A-Z_][A-Z0-9_$]*"
_QUALIFIED_TABLE = rf"(?P<catalog>{_IDENT})\.(?P<schema>{_IDENT})\.(?P<table>{_IDENT})"

_CREATE_DATABASE_RE = re.compile(
    rf"^CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+(?P<name>{_IDENT})$",
    re.IGNORECASE,
)
_CREATE_SCHEMA_RE = re.compile(
    rf"^CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+(?P<catalog>{_IDENT})\.(?P<schema>{_IDENT})$",
    re.IGNORECASE,
)
_CREATE_TABLE_HEAD_RE = re.compile(
    rf"^CREATE\s+TABLE\s+{_QUALIFIED_TABLE}\s*\((?P<body>.*)\)\s*(?P<tail>.*)$",
    re.IGNORECASE | re.DOTALL,
)
_CONSTRAINT_RE = re.compile(
    rf"^CONSTRAINT\s+(?P<name>{_IDENT})\s+(?P<body>.*)$",
    re.IGNORECASE | re.DOTALL,
)
_NOT_ENFORCED_SUFFIX_RE = re.compile(
    r"^(?P<body>.*?)\s+NOT\s+ENFORCED\s*$",
    re.IGNORECASE | re.DOTALL,
)
_PK_RE = re.compile(
    rf"^PRIMARY\s+KEY\s*\((?P<columns>[^)]+)\)$",
    re.IGNORECASE,
)
_UNIQUE_RE = re.compile(
    rf"^UNIQUE\s*\((?P<columns>[^)]+)\)$",
    re.IGNORECASE,
)
_FK_RE = re.compile(
    rf"^FOREIGN\s+KEY\s*\((?P<columns>[^)]+)\)\s*"
    rf"REFERENCES\s+{_QUALIFIED_TABLE}\s*\((?P<ref_columns>[^)]+)\)$",
    re.IGNORECASE | re.DOTALL,
)
_TYPE_NUMBER_RE = re.compile(
    r"^NUMBER\s*\(\s*(?P<precision>\d+)\s*,\s*(?P<scale>\d+)\s*\)$",
    re.IGNORECASE,
)
_TYPE_VARCHAR_RE = re.compile(
    r"^VARCHAR\s*\(\s*(?P<length>\d+)\s*\)$",
    re.IGNORECASE,
)
_TYPE_DATE_RE = re.compile(r"^DATE$", re.IGNORECASE)
_TYPE_TIMESTAMP_RE = re.compile(
    r"^TIMESTAMP_NTZ\s*\(\s*(?P<precision>\d+)\s*\)$",
    re.IGNORECASE,
)
_TYPE_BOOLEAN_RE = re.compile(r"^BOOLEAN$", re.IGNORECASE)
_TYPE_FLOAT_RE = re.compile(r"^FLOAT$", re.IGNORECASE)
_TYPE_BINARY_RE = re.compile(
    r"^BINARY\s*\(\s*(?P<length>\d+)\s*\)$",
    re.IGNORECASE,
)
_LEADING_TYPE_RE = re.compile(
    r"^(?:"
    r"NUMBER\s*\(\s*\d+\s*,\s*\d+\s*\)|"
    r"VARCHAR\s*\(\s*\d+\s*\)|"
    r"TIMESTAMP_NTZ\s*\(\s*\d+\s*\)|"
    r"BINARY\s*\(\s*\d+\s*\)|"
    r"DATE\b|"
    r"BOOLEAN\b|"
    r"FLOAT\b"
    r")",
    re.IGNORECASE,
)
_RELY_RE = re.compile(r"\bRELY\b", re.IGNORECASE)
_COLUMN_NAME_RE = re.compile(rf"^(?P<name>{_IDENT})\s+(?P<rest>.*)$", re.IGNORECASE)
_NOT_NULL_HEAD_RE = re.compile(r"^NOT\s+NULL\b", re.IGNORECASE)
_DEFAULT_HEAD_RE = re.compile(r"^DEFAULT\b", re.IGNORECASE)
_COMMENT_HEAD_RE = re.compile(r"^COMMENT\b", re.IGNORECASE)
_TABLE_COMMENT_HEAD_RE = re.compile(r"^COMMENT\s*=\s*", re.IGNORECASE)
_QUOTE_RE = re.compile(r"\"|`")
_ALTER_ADD_FK_RE = re.compile(
    rf"^ALTER\s+TABLE\s+(?P<catalog>{_IDENT})\.(?P<schema>{_IDENT})\.(?P<table>{_IDENT})\s+"
    rf"ADD\s+CONSTRAINT\s+(?P<name>{_IDENT})\s+"
    rf"FOREIGN\s+KEY\s*\((?P<columns>[^)]+)\)\s*"
    rf"REFERENCES\s+(?P<ref_catalog>{_IDENT})\.(?P<ref_schema>{_IDENT})\."
    rf"(?P<ref_table>{_IDENT})\s*\((?P<ref_columns>[^)]+)\)\s+"
    rf"NOT\s+ENFORCED$",
    re.IGNORECASE | re.DOTALL,
)


@dataclass
class _ParsedColumn:
    name: str
    data_type: DataType
    nullable: bool
    default: str | None
    comment: str | None = None


@dataclass
class _ParsedConstraint:
    name: str
    kind: str
    columns: tuple[str, ...]
    referenced_table: tuple[str, str, str] | None = None
    referenced_columns: tuple[str, ...] = ()


@dataclass
class _ParsedTable:
    catalog: str
    schema: str
    name: str
    columns: list[_ParsedColumn]
    constraints: list[_ParsedConstraint]
    comment: str | None = None


def import_snowflake_ddl(sql: str, *, model_name: str) -> PhysicalModel:
    """Import a constrained Snowflake DDL subset into PhysicalModel v1."""

    if not isinstance(sql, str):
        raise SnowflakeDDLImportError("sql must be a string")
    if not sql.strip():
        raise SnowflakeDDLImportError("sql must be non-empty")
    if not isinstance(model_name, str) or not model_name.strip():
        raise SnowflakeDDLImportError("model_name must be a nonblank string")

    statements = _split_statements(sql)
    if not statements:
        raise SnowflakeDDLImportError("sql must be non-empty")

    databases: set[str] = set()
    schemas: set[tuple[str, str]] = set()
    tables: list[_ParsedTable] = []
    tables_by_key: dict[tuple[str, str, str], _ParsedTable] = {}
    seen_table_keys: set[tuple[str, str, str]] = set()

    for statement in statements:
        upper = statement.upper()
        if upper.startswith("CREATE DATABASE"):
            match = _CREATE_DATABASE_RE.match(statement)
            if match is None:
                raise SnowflakeDDLImportError(
                    f"malformed CREATE DATABASE statement: {statement}"
                )
            name = match.group("name").upper()
            if name in databases:
                raise SnowflakeDDLImportError(f"duplicate database {name}")
            databases.add(name)
            continue

        if upper.startswith("CREATE SCHEMA"):
            match = _CREATE_SCHEMA_RE.match(statement)
            if match is None:
                raise SnowflakeDDLImportError(
                    f"malformed CREATE SCHEMA statement: {statement}"
                )
            catalog = match.group("catalog").upper()
            schema = match.group("schema").upper()
            key = (catalog, schema)
            if key in schemas:
                raise SnowflakeDDLImportError(f"duplicate schema {catalog}.{schema}")
            if catalog not in databases:
                raise SnowflakeDDLImportError(
                    f"unresolved database reference {catalog}"
                )
            schemas.add(key)
            continue

        if upper.startswith("CREATE TABLE"):
            parsed = _parse_create_table(statement)
            key = (parsed.catalog, parsed.schema, parsed.name)
            if key in seen_table_keys:
                raise SnowflakeDDLImportError(
                    f"duplicate table {parsed.catalog}.{parsed.schema}.{parsed.name}"
                )
            if (parsed.catalog, parsed.schema) not in schemas:
                raise SnowflakeDDLImportError(
                    "unresolved schema reference "
                    f"{parsed.catalog}.{parsed.schema}"
                )
            seen_table_keys.add(key)
            tables.append(parsed)
            tables_by_key[key] = parsed
            continue

        if upper.startswith("ALTER TABLE"):
            _apply_alter_add_foreign_key(statement, tables_by_key=tables_by_key)
            continue

        if upper.startswith("CREATE "):
            kind = statement.split(None, 2)[1]
            raise SnowflakeDDLImportError(
                f"unsupported statement type CREATE {kind.upper()}"
            )
        raise SnowflakeDDLImportError(f"unsupported statement: {statement}")

    return _build_model(model_name=model_name, schemas=schemas, tables=tables)


def render_snowflake_ddl(model: PhysicalModel) -> str:
    """Render deterministic Snowflake DDL for a PhysicalModel v1 graph."""

    if not isinstance(model, PhysicalModel):
        raise TypeError("model must be a PhysicalModel")

    lines: list[str] = []
    catalogs = sorted({namespace.catalog for namespace in model.namespaces})
    for catalog in catalogs:
        lines.append(f"CREATE DATABASE IF NOT EXISTS {catalog};")

    for namespace in model.namespaces:
        lines.append(
            f"CREATE SCHEMA IF NOT EXISTS {namespace.catalog}.{namespace.schema};"
        )

    if model.namespaces:
        lines.append("")

    ddl_tables = _tables_in_dependency_order(model)
    for index, table in enumerate(ddl_tables):
        namespace = _namespace_for_table(model, table)
        lines.append(
            f"CREATE TABLE {namespace.catalog}.{namespace.schema}.{table.name} ("
        )
        body_lines: list[str] = []
        for column in table.columns:
            body_lines.append(f"    {_render_column(column)}")
        for constraint in table.constraints:
            if constraint.kind == "foreign_key":
                continue
            body_lines.append(
                f"    {_render_constraint(constraint, model=model, table=table)}"
            )
        for body_index, body_line in enumerate(body_lines):
            suffix = "," if body_index < len(body_lines) - 1 else ""
            lines.append(f"{body_line}{suffix}")
        if table.comment is not None:
            lines.append(f") COMMENT={_sql_string_literal(table.comment)};")
        else:
            lines.append(");")
        if index < len(ddl_tables) - 1:
            lines.append("")

    fk_alters = _foreign_key_alter_statements(model, ddl_tables)
    if fk_alters:
        if lines and lines[-1] != "":
            lines.append("")
        lines.extend(fk_alters)

    return "\n".join(lines) + "\n"


def _tables_in_dependency_order(model: PhysicalModel) -> tuple[Table, ...]:
    """Order referenced tables before FK owners, with stable cycle residuals."""

    tables_by_id = {table.id: table for table in model.tables}
    dependencies = {
        table.id: {
            constraint.referenced_table_id
            for constraint in table.constraints
            if constraint.kind == "foreign_key"
            and constraint.referenced_table_id != table.id
        }
        for table in model.tables
    }
    ordered: list[Table] = []
    remaining = set(tables_by_id)
    while remaining:
        ready = sorted(
            table_id_value
            for table_id_value in remaining
            if not (dependencies[table_id_value] & remaining)
        )
        if not ready:
            # Cyclic residual: emit remaining tables in stable id order.
            for table_id_value in sorted(remaining):
                ordered.append(tables_by_id[table_id_value])
            break
        for table_id_value in ready:
            ordered.append(tables_by_id[table_id_value])
            remaining.remove(table_id_value)
    return tuple(ordered)


def _foreign_key_alter_statements(
    model: PhysicalModel, ddl_tables: tuple[Table, ...]
) -> list[str]:
    statements: list[str] = []
    for table in ddl_tables:
        namespace = _namespace_for_table(model, table)
        for constraint in table.constraints:
            if constraint.kind != "foreign_key":
                continue
            statements.append(
                _render_foreign_key_alter(
                    constraint,
                    model=model,
                    table=table,
                    catalog=namespace.catalog,
                    schema=namespace.schema,
                )
            )
    statements.sort()
    return statements


def _split_statements(sql: str) -> list[str]:
    return _split_sql_list(sql.strip(), separator=";", label="statement")


def _split_table_items(body: str) -> list[str]:
    return _split_sql_list(body, separator=",", label="table item")


def _split_sql_list(text: str, *, separator: str, label: str) -> list[str]:
    """Split on separator outside parentheses and single-quoted strings."""

    items: list[str] = []
    current: list[str] = []
    depth = 0
    in_string = False
    index = 0
    length = len(text)

    while index < length:
        char = text[index]
        if in_string:
            current.append(char)
            if char == "'":
                if index + 1 < length and text[index + 1] == "'":
                    current.append(text[index + 1])
                    index += 2
                    continue
                in_string = False
            index += 1
            continue

        if char == "'":
            in_string = True
            current.append(char)
            index += 1
            continue

        if char == "(":
            depth += 1
            current.append(char)
            index += 1
            continue

        if char == ")":
            depth -= 1
            if depth < 0:
                raise SnowflakeDDLImportError("malformed DDL: unmatched ')'")
            current.append(char)
            index += 1
            continue

        if char == separator and depth == 0:
            item = "".join(current).strip()
            if label == "table item" and not item:
                raise SnowflakeDDLImportError(f"malformed DDL: empty {label}")
            if item:
                items.append(item)
            current = []
            index += 1
            continue

        current.append(char)
        index += 1

    if in_string:
        raise SnowflakeDDLImportError("malformed DDL: unterminated string literal")
    if depth != 0:
        raise SnowflakeDDLImportError("malformed DDL: unmatched '('")

    trailing = "".join(current).strip()
    if trailing:
        items.append(trailing)
    elif label == "table item" and not items:
        raise SnowflakeDDLImportError("malformed DDL: empty table body")

    if label == "table item" and not items:
        raise SnowflakeDDLImportError("malformed DDL: empty table body")
    return items


def _apply_alter_add_foreign_key(
    statement: str,
    *,
    tables_by_key: dict[tuple[str, str, str], _ParsedTable],
) -> None:
    match = _ALTER_ADD_FK_RE.match(" ".join(statement.split()))
    if match is None:
        raise SnowflakeDDLImportError(
            f"unsupported or malformed ALTER TABLE statement: {statement}"
        )

    catalog = match.group("catalog").upper()
    schema = match.group("schema").upper()
    table_name = match.group("table").upper()
    owner_key = (catalog, schema, table_name)
    owner = tables_by_key.get(owner_key)
    if owner is None:
        raise SnowflakeDDLImportError(
            f"ALTER TABLE references unknown table {catalog}.{schema}.{table_name}"
        )

    constraint_name = match.group("name").upper()
    if any(item.name == constraint_name for item in owner.constraints):
        raise SnowflakeDDLImportError(f"duplicate constraint {constraint_name}")

    local_columns = _parse_identifier_list(match.group("columns"))
    if len(local_columns) != len(set(local_columns)):
        raise SnowflakeDDLImportError(
            f"constraint {constraint_name} columns must be unique"
        )
    owner_column_names = {column.name for column in owner.columns}
    for name in local_columns:
        if name not in owner_column_names:
            raise SnowflakeDDLImportError(
                f"constraint {constraint_name} references unknown column {name}"
            )

    ref_catalog = match.group("ref_catalog").upper()
    ref_schema = match.group("ref_schema").upper()
    ref_table = match.group("ref_table").upper()
    referenced_columns = _parse_identifier_list(match.group("ref_columns"))
    if len(referenced_columns) != len(set(referenced_columns)):
        raise SnowflakeDDLImportError(
            f"constraint {constraint_name} referenced_columns must be unique"
        )
    target = tables_by_key.get((ref_catalog, ref_schema, ref_table))
    if target is None:
        raise SnowflakeDDLImportError(
            "unresolved foreign key reference "
            f"{ref_catalog}.{ref_schema}.{ref_table}"
        )
    target_column_names = {column.name for column in target.columns}
    for name in referenced_columns:
        if name not in target_column_names:
            raise SnowflakeDDLImportError(
                "unresolved foreign key column "
                f"{ref_catalog}.{ref_schema}.{ref_table}.{name}"
            )

    owner.constraints.append(
        _ParsedConstraint(
            name=constraint_name,
            kind="foreign_key",
            columns=local_columns,
            referenced_table=(ref_catalog, ref_schema, ref_table),
            referenced_columns=referenced_columns,
        )
    )


def _parse_create_table(statement: str) -> _ParsedTable:
    match = _CREATE_TABLE_HEAD_RE.match(statement)
    if match is None:
        raise SnowflakeDDLImportError(f"malformed CREATE TABLE statement: {statement}")

    catalog = match.group("catalog").upper()
    schema = match.group("schema").upper()
    table_name = match.group("table").upper()
    body = match.group("body").strip()
    table_comment = _parse_table_comment_tail(match.group("tail"))
    if not body:
        raise SnowflakeDDLImportError(
            f"CREATE TABLE {catalog}.{schema}.{table_name} has an empty body"
        )

    columns: list[_ParsedColumn] = []
    constraints: list[_ParsedConstraint] = []
    seen_column_names: set[str] = set()
    seen_constraint_names: set[str] = set()

    for raw_item in _split_table_items(body):
        item = raw_item.strip()
        constraint_match = _CONSTRAINT_RE.match(item)
        if constraint_match is not None:
            constraint = _parse_constraint(constraint_match)
            if constraint.name in seen_constraint_names:
                raise SnowflakeDDLImportError(
                    f"duplicate constraint {constraint.name}"
                )
            seen_constraint_names.add(constraint.name)
            constraints.append(constraint)
            continue

        column = _parse_column(item)
        if column.name in seen_column_names:
            raise SnowflakeDDLImportError(f"duplicate column {column.name}")
        seen_column_names.add(column.name)
        columns.append(column)

    if not columns:
        raise SnowflakeDDLImportError(
            f"CREATE TABLE {catalog}.{schema}.{table_name} has no columns"
        )

    column_names = {column.name for column in columns}
    primary_key_count = 0
    for constraint in constraints:
        if constraint.kind == "primary_key":
            primary_key_count += 1
        _reject_duplicate_constraint_columns(constraint)
        for name in constraint.columns:
            if name not in column_names:
                raise SnowflakeDDLImportError(
                    f"constraint {constraint.name} references unknown column {name}"
                )

    if primary_key_count > 1:
        raise SnowflakeDDLImportError(
            f"table {catalog}.{schema}.{table_name} may have at most one "
            "primary_key constraint"
        )

    return _ParsedTable(
        catalog=catalog,
        schema=schema,
        name=table_name,
        columns=columns,
        constraints=constraints,
        comment=table_comment,
    )


def _parse_table_comment_tail(tail: str) -> str | None:
    text = tail.strip()
    if not text:
        return None
    head = _TABLE_COMMENT_HEAD_RE.match(text)
    if head is None:
        raise SnowflakeDDLImportError(f"unsupported CREATE TABLE clause: {text}")
    index = head.end()
    if index >= len(text) or text[index] != "'":
        raise SnowflakeDDLImportError(
            f"malformed table COMMENT: expected string literal in {text}"
        )
    comment, end = _scan_quoted_string(text, index)
    leftover = text[end:].strip()
    if leftover:
        raise SnowflakeDDLImportError(
            f"unsupported CREATE TABLE clause after COMMENT: {leftover}"
        )
    return comment


def _parse_column(item: str) -> _ParsedColumn:
    match = _COLUMN_NAME_RE.match(item)
    if match is None:
        raise SnowflakeDDLImportError(f"malformed column definition: {item}")
    name = match.group("name").upper()
    rest = match.group("rest").strip()
    type_token, remainder = _split_type_and_rest(rest)
    data_type = _parse_data_type(type_token)
    nullable, default, comment = _parse_column_trailing_clauses(
        remainder, column_name=name
    )
    return _ParsedColumn(
        name=name,
        data_type=data_type,
        nullable=nullable,
        default=default,
        comment=comment,
    )


def _split_type_and_rest(text: str) -> tuple[str, str]:
    stripped = text.strip()
    if not stripped:
        raise SnowflakeDDLImportError("column is missing a data type")
    match = _LEADING_TYPE_RE.match(stripped)
    if match is None:
        first_token = stripped.split(None, 1)[0]
        raise SnowflakeDDLImportError(f"unsupported type {first_token}")
    type_token = match.group(0)
    remainder = stripped[match.end() :].strip()
    return type_token, remainder


def _parse_column_trailing_clauses(
    remainder: str, *, column_name: str
) -> tuple[bool, str | None, str | None]:
    nullable = True
    default: str | None = None
    comment: str | None = None
    text = remainder.strip()
    index = 0
    length = len(text)

    while index < length:
        while index < length and text[index].isspace():
            index += 1
        if index >= length:
            break

        not_null_match = _NOT_NULL_HEAD_RE.match(text[index:])
        if not_null_match is not None:
            nullable = False
            index += not_null_match.end()
            continue

        default_match = _DEFAULT_HEAD_RE.match(text[index:])
        if default_match is not None:
            index += default_match.end()
            while index < length and text[index].isspace():
                index += 1
            if index >= length:
                raise SnowflakeDDLImportError(
                    f"unsupported column clause in {column_name}: DEFAULT"
                )
            default_value, index = _scan_default_expression(text, index)
            default = default_value
            continue

        comment_match = _COMMENT_HEAD_RE.match(text[index:])
        if comment_match is not None:
            index += comment_match.end()
            while index < length and text[index].isspace():
                index += 1
            if index >= length or text[index] != "'":
                raise SnowflakeDDLImportError(
                    f"malformed column COMMENT in {column_name}: "
                    "expected string literal"
                )
            comment, index = _scan_quoted_string(text, index)
            continue

        raise SnowflakeDDLImportError(
            f"unsupported column clause in {column_name}: {text[index:].strip()}"
        )

    return nullable, default, comment


def _sql_string_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _scan_quoted_string(text: str, start: int) -> tuple[str, int]:
    """Scan a single-quoted SQL string; return unescaped text and end index."""

    if start >= len(text) or text[start] != "'":
        raise SnowflakeDDLImportError("malformed DDL: expected string literal")
    index = start + 1
    chars: list[str] = []
    length = len(text)
    while index < length:
        char = text[index]
        if char == "'":
            if index + 1 < length and text[index + 1] == "'":
                chars.append("'")
                index += 2
                continue
            return "".join(chars), index + 1
        chars.append(char)
        index += 1
    raise SnowflakeDDLImportError("malformed DDL: unterminated string literal")


def _scan_default_expression(text: str, start: int) -> tuple[str, int]:
    """Scan a DEFAULT expression with quote/paren awareness until next clause."""

    index = start
    length = len(text)
    depth = 0
    in_string = False

    while index < length:
        char = text[index]
        if in_string:
            if char == "'":
                if index + 1 < length and text[index + 1] == "'":
                    index += 2
                    continue
                in_string = False
            index += 1
            continue

        if char == "'":
            in_string = True
            index += 1
            continue

        if char == "(":
            depth += 1
            index += 1
            continue

        if char == ")":
            depth -= 1
            if depth < 0:
                raise SnowflakeDDLImportError("malformed DDL: unmatched ')'")
            index += 1
            continue

        if depth == 0 and (
            _NOT_NULL_HEAD_RE.match(text[index:]) is not None
            or _COMMENT_HEAD_RE.match(text[index:]) is not None
        ):
            break

        index += 1

    if in_string:
        raise SnowflakeDDLImportError("malformed DDL: unterminated string literal")
    if depth != 0:
        raise SnowflakeDDLImportError("malformed DDL: unmatched '('")

    expression = text[start:index].strip()
    if not expression:
        raise SnowflakeDDLImportError("malformed DDL: empty DEFAULT expression")
    return expression, index


def _parse_data_type(token: str) -> DataType:
    compact = " ".join(token.split())
    try:
        number_match = _TYPE_NUMBER_RE.match(compact)
        if number_match is not None:
            precision = int(number_match.group("precision"))
            scale = int(number_match.group("scale"))
            return DataType(
                family="NUMBER",
                text=f"NUMBER({precision}, {scale})",
                precision=precision,
                scale=scale,
                length=None,
            )
        varchar_match = _TYPE_VARCHAR_RE.match(compact)
        if varchar_match is not None:
            length = int(varchar_match.group("length"))
            return DataType(
                family="VARCHAR",
                text=f"VARCHAR({length})",
                precision=None,
                scale=None,
                length=length,
            )
        if _TYPE_DATE_RE.match(compact):
            return DataType(
                family="DATE",
                text="DATE",
                precision=None,
                scale=None,
                length=None,
            )
        timestamp_match = _TYPE_TIMESTAMP_RE.match(compact)
        if timestamp_match is not None:
            precision = int(timestamp_match.group("precision"))
            return DataType(
                family="TIMESTAMP_NTZ",
                text=f"TIMESTAMP_NTZ({precision})",
                precision=precision,
                scale=None,
                length=None,
            )
        if _TYPE_BOOLEAN_RE.match(compact):
            return DataType(
                family="BOOLEAN",
                text="BOOLEAN",
                precision=None,
                scale=None,
                length=None,
            )
        if _TYPE_FLOAT_RE.match(compact):
            return DataType(
                family="FLOAT",
                text="FLOAT",
                precision=None,
                scale=None,
                length=None,
            )
        binary_match = _TYPE_BINARY_RE.match(compact)
        if binary_match is not None:
            length = int(binary_match.group("length"))
            return DataType(
                family="BINARY",
                text=f"BINARY({length})",
                precision=None,
                scale=None,
                length=length,
            )
    except ValueError as exc:
        raise SnowflakeDDLImportError(str(exc)) from exc
    raise SnowflakeDDLImportError(f"unsupported type {token}")


def _parse_constraint(match: re.Match[str]) -> _ParsedConstraint:
    name = match.group("name").upper()
    body = " ".join(match.group("body").split())
    if _RELY_RE.search(body):
        raise SnowflakeDDLImportError(
            f"RELY is not supported for informational constraints: {name}"
        )
    not_enforced_match = _NOT_ENFORCED_SUFFIX_RE.match(body)
    if not_enforced_match is not None:
        body = " ".join(not_enforced_match.group("body").split())
    pk_match = _PK_RE.match(body)
    if pk_match is not None:
        return _ParsedConstraint(
            name=name,
            kind="primary_key",
            columns=_parse_identifier_list(pk_match.group("columns")),
        )
    unique_match = _UNIQUE_RE.match(body)
    if unique_match is not None:
        return _ParsedConstraint(
            name=name,
            kind="unique",
            columns=_parse_identifier_list(unique_match.group("columns")),
        )
    fk_match = _FK_RE.match(body)
    if fk_match is not None:
        return _ParsedConstraint(
            name=name,
            kind="foreign_key",
            columns=_parse_identifier_list(fk_match.group("columns")),
            referenced_table=(
                fk_match.group("catalog").upper(),
                fk_match.group("schema").upper(),
                fk_match.group("table").upper(),
            ),
            referenced_columns=_parse_identifier_list(fk_match.group("ref_columns")),
        )
    raise SnowflakeDDLImportError(f"unsupported or malformed constraint {name}: {body}")


def _parse_identifier_list(text: str) -> tuple[str, ...]:
    parts = [part.strip() for part in text.split(",")]
    if not parts or any(not part for part in parts):
        raise SnowflakeDDLImportError(f"malformed identifier list: {text}")
    names: list[str] = []
    for part in parts:
        if _QUOTE_RE.search(part):
            raise SnowflakeDDLImportError("quoted identifiers are not supported in v1")
        if not re.fullmatch(_IDENT, part, flags=re.IGNORECASE):
            raise SnowflakeDDLImportError(f"malformed identifier: {part}")
        names.append(part.upper())
    return tuple(names)


def _reject_duplicate_constraint_columns(constraint: _ParsedConstraint) -> None:
    if len(constraint.columns) != len(set(constraint.columns)):
        raise SnowflakeDDLImportError(
            f"constraint {constraint.name} columns must be unique"
        )
    if constraint.kind == "foreign_key" and len(constraint.referenced_columns) != len(
        set(constraint.referenced_columns)
    ):
        raise SnowflakeDDLImportError(
            f"constraint {constraint.name} referenced_columns must be unique"
        )


def _build_model(
    *,
    model_name: str,
    schemas: set[tuple[str, str]],
    tables: list[_ParsedTable],
) -> PhysicalModel:
    namespaces = tuple(
        sorted(
            (
                Namespace(
                    id=namespace_id(catalog, schema),
                    catalog=catalog,
                    schema=schema,
                )
                for catalog, schema in schemas
            ),
            key=lambda item: item.id,
        )
    )

    table_keys = {(table.catalog, table.schema, table.name): table for table in tables}
    built_tables: list[Table] = []

    for parsed in tables:
        columns = tuple(
            Column(
                id=column_id(parsed.catalog, parsed.schema, parsed.name, column.name),
                name=column.name,
                ordinal=index,
                data_type=column.data_type,
                nullable=column.nullable,
                default=column.default,
                comment=column.comment,
            )
            for index, column in enumerate(parsed.columns, start=1)
        )
        constraints: list[TableConstraint] = []
        for constraint in parsed.constraints:
            local_columns = tuple(
                column_id(parsed.catalog, parsed.schema, parsed.name, column_name)
                for column_name in constraint.columns
            )
            referenced_table_id = None
            referenced_columns: tuple[str, ...] = ()
            if constraint.kind == "foreign_key":
                assert constraint.referenced_table is not None
                ref_catalog, ref_schema, ref_table = constraint.referenced_table
                if (ref_catalog, ref_schema, ref_table) not in table_keys:
                    raise SnowflakeDDLImportError(
                        "unresolved foreign key reference "
                        f"{ref_catalog}.{ref_schema}.{ref_table}"
                    )
                referenced = table_keys[(ref_catalog, ref_schema, ref_table)]
                referenced_names = {column.name for column in referenced.columns}
                for column_name in constraint.referenced_columns:
                    if column_name not in referenced_names:
                        raise SnowflakeDDLImportError(
                            "unresolved foreign key column "
                            f"{ref_catalog}.{ref_schema}.{ref_table}.{column_name}"
                        )
                referenced_table_id = table_id(ref_catalog, ref_schema, ref_table)
                referenced_columns = tuple(
                    column_id(ref_catalog, ref_schema, ref_table, column_name)
                    for column_name in constraint.referenced_columns
                )
            constraints.append(
                TableConstraint(
                    id=constraint_id(
                        parsed.catalog, parsed.schema, parsed.name, constraint.name
                    ),
                    name=constraint.name,
                    kind=constraint.kind,
                    columns=local_columns,
                    referenced_table_id=referenced_table_id,
                    referenced_columns=referenced_columns,
                )
            )
        constraints.sort(key=lambda item: item.id)
        built_tables.append(
            Table(
                id=table_id(parsed.catalog, parsed.schema, parsed.name),
                namespace_id=namespace_id(parsed.catalog, parsed.schema),
                name=parsed.name,
                kind="table",
                columns=columns,
                constraints=tuple(constraints),
                comment=parsed.comment,
            )
        )

    built_tables.sort(key=lambda item: item.id)
    relationships: list[Relationship] = []
    for table in built_tables:
        path_catalog, path_schema, path_table = _split_table_path(table.id)
        for constraint in table.constraints:
            if constraint.kind != "foreign_key":
                continue
            assert constraint.name is not None
            relationships.append(
                Relationship(
                    id=relationship_id(
                        path_catalog, path_schema, path_table, constraint.name
                    ),
                    name=constraint.name,
                    source_table_id=table.id,
                    source_column_ids=constraint.columns,
                    target_table_id=constraint.referenced_table_id or "",
                    target_column_ids=constraint.referenced_columns,
                    cardinality="many_to_one",
                )
            )
    relationships.sort(key=lambda item: item.id)

    try:
        return PhysicalModel(
            name=model_name,
            model_version="1",
            namespaces=namespaces,
            tables=tuple(built_tables),
            relationships=tuple(relationships),
        )
    except ValueError as exc:
        raise SnowflakeDDLImportError(str(exc)) from exc


def _split_table_path(table_object_id: str) -> tuple[str, str, str]:
    path = table_object_id.removeprefix("table:")
    catalog, schema, name = path.split(".", 2)
    return catalog, schema, name


def _namespace_for_table(model: PhysicalModel, table: Table) -> Namespace:
    for namespace in model.namespaces:
        if namespace.id == table.namespace_id:
            return namespace
    raise ValueError(f"namespace_id references unknown namespace {table.namespace_id!r}")


def _render_column(column: Column) -> str:
    parts = [column.name, column.data_type.text]
    if not column.nullable:
        parts.append("NOT NULL")
    if column.default is not None:
        parts.append(f"DEFAULT {column.default}")
    if column.comment is not None:
        parts.append(f"COMMENT {_sql_string_literal(column.comment)}")
    return " ".join(parts)


def _render_constraint(
    constraint: TableConstraint, *, model: PhysicalModel, table: Table
) -> str:
    local_names = [_column_name(table, column_id_value) for column_id_value in constraint.columns]
    local_list = ", ".join(local_names)
    assert constraint.name is not None
    if constraint.kind == "primary_key":
        return (
            f"CONSTRAINT {constraint.name} PRIMARY KEY ({local_list}) NOT ENFORCED"
        )
    if constraint.kind == "unique":
        return f"CONSTRAINT {constraint.name} UNIQUE ({local_list}) NOT ENFORCED"
    if constraint.kind == "foreign_key":
        raise ValueError(
            "foreign_key constraints must be rendered as ALTER TABLE statements"
        )
    raise ValueError(f"unsupported constraint kind {constraint.kind}")


def _render_foreign_key_alter(
    constraint: TableConstraint,
    *,
    model: PhysicalModel,
    table: Table,
    catalog: str,
    schema: str,
) -> str:
    local_names = [
        _column_name(table, column_id_value) for column_id_value in constraint.columns
    ]
    local_list = ", ".join(local_names)
    assert constraint.name is not None
    target = _table_by_id(model, constraint.referenced_table_id or "")
    target_namespace = _namespace_for_table(model, target)
    ref_names = [
        _column_name(target, column_id_value)
        for column_id_value in constraint.referenced_columns
    ]
    ref_list = ", ".join(ref_names)
    return (
        f"ALTER TABLE {catalog}.{schema}.{table.name} "
        f"ADD CONSTRAINT {constraint.name} FOREIGN KEY ({local_list}) "
        f"REFERENCES {target_namespace.catalog}.{target_namespace.schema}."
        f"{target.name} ({ref_list}) NOT ENFORCED;"
    )


def _table_by_id(model: PhysicalModel, table_object_id: str) -> Table:
    for table in model.tables:
        if table.id == table_object_id:
            return table
    raise ValueError(f"unknown table id {table_object_id!r}")


def _column_name(table: Table, column_object_id: str) -> str:
    for column in table.columns:
        if column.id == column_object_id:
            return column.name
    raise ValueError(f"unknown column id {column_object_id!r}")
