"""Canonical physical model primitives."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


SUPPORTED_TYPE_FAMILIES = frozenset(
    {"NUMBER", "VARCHAR", "DATE", "TIMESTAMP_NTZ", "BOOLEAN", "FLOAT", "BINARY"}
)
SUPPORTED_CONSTRAINT_KINDS = frozenset({"primary_key", "unique", "foreign_key"})
SUPPORTED_TABLE_KINDS = frozenset({"table"})
SUPPORTED_CARDINALITIES = frozenset({"many_to_one"})

NUMBER_PRECISION_MIN = 1
NUMBER_PRECISION_MAX = 38
NUMBER_SCALE_MIN = 0
NUMBER_SCALE_MAX = 37
VARCHAR_LENGTH_MIN = 1
VARCHAR_LENGTH_MAX = 16777216
TIMESTAMP_NTZ_PRECISION_MIN = 0
TIMESTAMP_NTZ_PRECISION_MAX = 9
BINARY_LENGTH_MIN = 1
BINARY_LENGTH_MAX = 8388608
SNOWFLAKE_IDENTIFIER_MAX_LENGTH = 255
_SNOWFLAKE_UNQUOTED_IDENT_RE = re.compile(r"^[A-Z_][A-Z0-9_$]*$")

_DATA_TYPE_KEYS = frozenset({"family", "text", "precision", "scale", "length"})
_COLUMN_KEYS = frozenset(
    {"id", "name", "ordinal", "data_type", "nullable", "default", "comment"}
)
_CONSTRAINT_KEYS = frozenset(
    {
        "id",
        "name",
        "kind",
        "columns",
        "referenced_table_id",
        "referenced_columns",
    }
)
_NAMESPACE_KEYS = frozenset({"id", "catalog", "schema"})
_TABLE_KEYS = frozenset(
    {"id", "namespace_id", "name", "kind", "columns", "constraints", "comment"}
)
_RELATIONSHIP_KEYS = frozenset(
    {
        "id",
        "name",
        "source_table_id",
        "source_column_ids",
        "target_table_id",
        "target_column_ids",
        "cardinality",
    }
)
_PHYSICAL_MODEL_KEYS = frozenset(
    {"model_version", "name", "namespaces", "tables", "relationships"}
)


def _require_type(value: object, expected: type | tuple[type, ...], field: str) -> None:
    if not isinstance(value, expected):
        expected_name = (
            expected.__name__
            if isinstance(expected, type)
            else " or ".join(item.__name__ for item in expected)
        )
        raise ValueError(f"{field} must be {expected_name}")


def _require_nonblank_str(value: object, field: str) -> str:
    _require_type(value, str, field)
    if not value.strip():
        raise ValueError(f"{field} must be a nonblank string")
    return value


def _require_optional_str(value: object, field: str) -> str | None:
    if value is None:
        return None
    _require_type(value, str, field)
    return value


def _require_optional_nonblank_str(value: object, field: str) -> str | None:
    if value is None:
        return None
    return _require_nonblank_str(value, field)


def _require_legal_snowflake_identifier(value: object, field: str) -> str:
    _require_type(value, str, field)
    if not value:
        raise ValueError(f"{field} must be a nonblank string")
    if (
        len(value) > SNOWFLAKE_IDENTIFIER_MAX_LENGTH
        or _SNOWFLAKE_UNQUOTED_IDENT_RE.fullmatch(value) is None
    ):
        raise ValueError(
            f"{field} must be a legal uppercase unquoted Snowflake identifier"
        )
    return value


def _require_optional_legal_snowflake_identifier(
    value: object, field: str
) -> str | None:
    if value is None:
        return None
    return _require_legal_snowflake_identifier(value, field)


def _require_bool(value: object, field: str) -> bool:
    _require_type(value, bool, field)
    return value


def _require_int(value: object, field: str) -> int:
    _require_type(value, int, field)
    if isinstance(value, bool):
        raise ValueError(f"{field} must be int")
    return value


def _require_optional_int(value: object, field: str) -> int | None:
    if value is None:
        return None
    return _require_int(value, field)


def _require_tuple(value: object, field: str) -> tuple[Any, ...]:
    if isinstance(value, tuple):
        return value
    if isinstance(value, list):
        return tuple(value)
    raise ValueError(f"{field} must be a list or tuple")


def _require_exact_keys(data: Mapping[Any, Any], expected: frozenset[str], label: str) -> None:
    missing = expected.difference(data)
    if missing:
        raise ValueError(
            f"{label} is missing required {', '.join(sorted(missing))}"
        )
    unexpected = set(data).difference(expected)
    if unexpected:
        raise ValueError(
            f"{label} has unexpected field {', '.join(sorted(str(key) for key in unexpected))}"
        )


def _require_sorted_by_id(items: Sequence[Any], field: str) -> None:
    ids = [item.id for item in items]
    if ids != sorted(ids):
        raise ValueError(f"{field} must be lexicographically sorted by id")


def _canonical_type_text(
    family: str,
    *,
    precision: int | None,
    scale: int | None,
    length: int | None,
) -> str:
    if family == "NUMBER":
        return f"NUMBER({precision}, {scale})"
    if family == "VARCHAR":
        return f"VARCHAR({length})"
    if family == "DATE":
        return "DATE"
    if family == "TIMESTAMP_NTZ":
        return f"TIMESTAMP_NTZ({precision})"
    if family == "BOOLEAN":
        return "BOOLEAN"
    if family == "FLOAT":
        return "FLOAT"
    if family == "BINARY":
        return f"BINARY({length})"
    raise ValueError(f"family must be one of {sorted(SUPPORTED_TYPE_FAMILIES)}")


@dataclass(frozen=True)
class DataType:
    """Normalized physical SQL type."""

    family: str
    text: str
    precision: int | None = None
    scale: int | None = None
    length: int | None = None

    def __post_init__(self) -> None:
        family = _require_nonblank_str(self.family, "family").upper()
        if family not in SUPPORTED_TYPE_FAMILIES:
            raise ValueError(f"family must be one of {sorted(SUPPORTED_TYPE_FAMILIES)}")
        if family != self.family:
            object.__setattr__(self, "family", family)

        precision = _require_optional_int(self.precision, "precision")
        scale = _require_optional_int(self.scale, "scale")
        length = _require_optional_int(self.length, "length")
        text = _require_nonblank_str(self.text, "text")

        if family == "NUMBER":
            if precision is None:
                raise ValueError("precision is required for NUMBER")
            if scale is None:
                raise ValueError("scale is required for NUMBER")
            if length is not None:
                raise ValueError("length must be null for NUMBER")
            if not (NUMBER_PRECISION_MIN <= precision <= NUMBER_PRECISION_MAX):
                raise ValueError(
                    "precision must be between "
                    f"{NUMBER_PRECISION_MIN} and {NUMBER_PRECISION_MAX} for NUMBER"
                )
            max_scale = min(NUMBER_SCALE_MAX, precision)
            if not (NUMBER_SCALE_MIN <= scale <= max_scale):
                raise ValueError(
                    "scale must be between "
                    f"{NUMBER_SCALE_MIN} and min({NUMBER_SCALE_MAX}, precision) "
                    "for NUMBER"
                )
        elif family == "VARCHAR":
            if length is None:
                raise ValueError("length is required for VARCHAR")
            if precision is not None or scale is not None:
                raise ValueError("precision and scale must be null for VARCHAR")
            if not (VARCHAR_LENGTH_MIN <= length <= VARCHAR_LENGTH_MAX):
                raise ValueError(
                    "length must be between "
                    f"{VARCHAR_LENGTH_MIN} and {VARCHAR_LENGTH_MAX} for VARCHAR"
                )
        elif family == "TIMESTAMP_NTZ":
            if precision is None:
                raise ValueError("precision is required for TIMESTAMP_NTZ")
            if scale is not None or length is not None:
                raise ValueError("scale and length must be null for TIMESTAMP_NTZ")
            if not (
                TIMESTAMP_NTZ_PRECISION_MIN
                <= precision
                <= TIMESTAMP_NTZ_PRECISION_MAX
            ):
                raise ValueError(
                    "precision must be between "
                    f"{TIMESTAMP_NTZ_PRECISION_MIN} and "
                    f"{TIMESTAMP_NTZ_PRECISION_MAX} for TIMESTAMP_NTZ"
                )
        elif family == "BINARY":
            if length is None:
                raise ValueError("length is required for BINARY")
            if precision is not None or scale is not None:
                raise ValueError("precision and scale must be null for BINARY")
            if not (BINARY_LENGTH_MIN <= length <= BINARY_LENGTH_MAX):
                raise ValueError(
                    "length must be between "
                    f"{BINARY_LENGTH_MIN} and {BINARY_LENGTH_MAX} for BINARY"
                )
        elif family in {"DATE", "BOOLEAN", "FLOAT"}:
            if precision is not None or scale is not None or length is not None:
                raise ValueError(f"precision, scale, and length must be null for {family}")

        expected_text = _canonical_type_text(
            family, precision=precision, scale=scale, length=length
        )
        if text != expected_text:
            raise ValueError(f"text must equal {expected_text!r}")

    def to_dict(self) -> dict[str, object]:
        return {
            "family": self.family,
            "text": self.text,
            "precision": self.precision,
            "scale": self.scale,
            "length": self.length,
        }

    @classmethod
    def from_dict(cls, data: object) -> DataType:
        if not isinstance(data, Mapping):
            raise ValueError("data_type must be an object")
        _require_exact_keys(data, _DATA_TYPE_KEYS, "data_type")
        return cls(
            family=_require_nonblank_str(data["family"], "family"),
            text=_require_nonblank_str(data["text"], "text"),
            precision=_require_optional_int(data["precision"], "precision"),
            scale=_require_optional_int(data["scale"], "scale"),
            length=_require_optional_int(data["length"], "length"),
        )


@dataclass(frozen=True)
class Column:
    """Physical table column."""

    id: str
    name: str
    ordinal: int
    data_type: DataType
    nullable: bool
    default: str | None = None
    comment: str | None = None

    def __post_init__(self) -> None:
        _require_nonblank_str(self.id, "id")
        _require_legal_snowflake_identifier(self.name, "name")
        _require_int(self.ordinal, "ordinal")
        if self.ordinal < 1:
            raise ValueError("ordinal must be a one-based integer")
        _require_type(self.data_type, DataType, "data_type")
        _require_bool(self.nullable, "nullable")
        _require_optional_str(self.default, "default")
        _require_optional_str(self.comment, "comment")

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "ordinal": self.ordinal,
            "data_type": self.data_type.to_dict(),
            "nullable": self.nullable,
            "default": self.default,
            "comment": self.comment,
        }

    @classmethod
    def from_dict(cls, data: object) -> Column:
        if not isinstance(data, Mapping):
            raise ValueError("column must be an object")
        _require_exact_keys(data, _COLUMN_KEYS, "column")
        return cls(
            id=_require_nonblank_str(data["id"], "id"),
            name=_require_legal_snowflake_identifier(data["name"], "name"),
            ordinal=_require_int(data["ordinal"], "ordinal"),
            data_type=DataType.from_dict(data["data_type"]),
            nullable=_require_bool(data["nullable"], "nullable"),
            default=_require_optional_str(data["default"], "default"),
            comment=_require_optional_str(data["comment"], "comment"),
        )


@dataclass(frozen=True)
class TableConstraint:
    """Declared table constraint."""

    id: str
    name: str | None
    kind: str
    columns: tuple[str, ...]
    referenced_table_id: str | None = None
    referenced_columns: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        _require_nonblank_str(self.id, "id")
        name = _require_optional_legal_snowflake_identifier(self.name, "name")
        object.__setattr__(self, "name", name)
        kind = _require_nonblank_str(self.kind, "kind")
        if kind not in SUPPORTED_CONSTRAINT_KINDS:
            raise ValueError(f"kind must be one of {sorted(SUPPORTED_CONSTRAINT_KINDS)}")
        columns = _require_tuple(self.columns, "columns")
        if not columns:
            raise ValueError("columns must be a non-empty list")
        for index, column_id in enumerate(columns):
            _require_nonblank_str(column_id, f"columns[{index}]")
        if len(columns) != len(set(columns)):
            raise ValueError("columns must have unique ids")
        object.__setattr__(self, "columns", tuple(columns))

        referenced_table_id = _require_optional_nonblank_str(
            self.referenced_table_id, "referenced_table_id"
        )
        referenced_columns = _require_tuple(self.referenced_columns, "referenced_columns")
        for index, column_id in enumerate(referenced_columns):
            _require_nonblank_str(column_id, f"referenced_columns[{index}]")
        if len(referenced_columns) != len(set(referenced_columns)):
            raise ValueError("referenced_columns must have unique ids")
        object.__setattr__(self, "referenced_columns", tuple(referenced_columns))

        if kind == "foreign_key":
            if referenced_table_id is None:
                raise ValueError("referenced_table_id is required for foreign_key")
            if not referenced_columns:
                raise ValueError("referenced_columns is required for foreign_key")
            if len(referenced_columns) != len(columns):
                raise ValueError(
                    "referenced_columns must match columns length for foreign_key"
                )
        else:
            if referenced_table_id is not None:
                raise ValueError("referenced_table_id must be null for non-foreign_key")
            if referenced_columns:
                raise ValueError("referenced_columns must be empty for non-foreign_key")

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "columns": list(self.columns),
            "referenced_table_id": self.referenced_table_id,
            "referenced_columns": list(self.referenced_columns),
        }

    @classmethod
    def from_dict(cls, data: object) -> TableConstraint:
        if not isinstance(data, Mapping):
            raise ValueError("constraint must be an object")
        _require_exact_keys(data, _CONSTRAINT_KEYS, "constraint")
        return cls(
            id=_require_nonblank_str(data["id"], "id"),
            name=_require_optional_legal_snowflake_identifier(data["name"], "name"),
            kind=_require_nonblank_str(data["kind"], "kind"),
            columns=_require_tuple(data["columns"], "columns"),
            referenced_table_id=_require_optional_nonblank_str(
                data["referenced_table_id"], "referenced_table_id"
            ),
            referenced_columns=_require_tuple(
                data["referenced_columns"], "referenced_columns"
            ),
        )


@dataclass(frozen=True)
class Namespace:
    """Physical container for tables."""

    id: str
    catalog: str
    schema: str

    def __post_init__(self) -> None:
        _require_nonblank_str(self.id, "id")
        catalog = _require_legal_snowflake_identifier(self.catalog, "catalog")
        schema = _require_legal_snowflake_identifier(self.schema, "schema")
        object.__setattr__(self, "catalog", catalog)
        object.__setattr__(self, "schema", schema)
        expected_id = namespace_id(catalog, schema)
        if self.id != expected_id:
            raise ValueError(f"id must equal {expected_id!r}")

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "catalog": self.catalog,
            "schema": self.schema,
        }

    @classmethod
    def from_dict(cls, data: object) -> Namespace:
        if not isinstance(data, Mapping):
            raise ValueError("namespace must be an object")
        _require_exact_keys(data, _NAMESPACE_KEYS, "namespace")
        return cls(
            id=_require_nonblank_str(data["id"], "id"),
            catalog=_require_legal_snowflake_identifier(data["catalog"], "catalog"),
            schema=_require_legal_snowflake_identifier(data["schema"], "schema"),
        )


@dataclass(frozen=True)
class Table:
    """Permanent physical base table."""

    id: str
    namespace_id: str
    name: str
    kind: str
    columns: tuple[Column, ...]
    constraints: tuple[TableConstraint, ...] = ()
    comment: str | None = None

    def __post_init__(self) -> None:
        _require_nonblank_str(self.id, "id")
        _require_nonblank_str(self.namespace_id, "namespace_id")
        _require_legal_snowflake_identifier(self.name, "name")
        kind = _require_nonblank_str(self.kind, "kind")
        if kind not in SUPPORTED_TABLE_KINDS:
            raise ValueError(f"kind must be one of {sorted(SUPPORTED_TABLE_KINDS)}")
        columns = _require_tuple(self.columns, "columns")
        if not columns:
            raise ValueError("columns must be a non-empty list")
        typed_columns: list[Column] = []
        for index, column in enumerate(columns):
            if isinstance(column, Mapping):
                column = Column.from_dict(column)
            _require_type(column, Column, f"columns[{index}]")
            typed_columns.append(column)
        object.__setattr__(self, "columns", tuple(typed_columns))

        expected_ordinals = list(range(1, len(typed_columns) + 1))
        actual_ordinals = [column.ordinal for column in typed_columns]
        if actual_ordinals != expected_ordinals:
            raise ValueError("ordinal must be one-based and contiguous in column order")

        column_ids = [column.id for column in typed_columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("columns must have unique ids")

        constraints = _require_tuple(self.constraints, "constraints")
        typed_constraints: list[TableConstraint] = []
        for index, constraint in enumerate(constraints):
            if isinstance(constraint, Mapping):
                constraint = TableConstraint.from_dict(constraint)
            _require_type(constraint, TableConstraint, f"constraints[{index}]")
            typed_constraints.append(constraint)
        object.__setattr__(self, "constraints", tuple(typed_constraints))
        _require_sorted_by_id(typed_constraints, "constraints")

        constraint_ids = [constraint.id for constraint in typed_constraints]
        if len(constraint_ids) != len(set(constraint_ids)):
            raise ValueError("constraints must have unique ids")

        primary_key_count = sum(
            1 for constraint in typed_constraints if constraint.kind == "primary_key"
        )
        if primary_key_count > 1:
            raise ValueError("table may have at most one primary_key constraint")

        column_id_set = set(column_ids)
        for constraint in typed_constraints:
            for column_id in constraint.columns:
                if column_id not in column_id_set:
                    raise ValueError(
                        f"columns reference unknown column id {column_id!r}"
                    )

        _require_optional_str(self.comment, "comment")

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "namespace_id": self.namespace_id,
            "name": self.name,
            "kind": self.kind,
            "columns": [column.to_dict() for column in self.columns],
            "constraints": [constraint.to_dict() for constraint in self.constraints],
            "comment": self.comment,
        }

    @classmethod
    def from_dict(cls, data: object) -> Table:
        if not isinstance(data, Mapping):
            raise ValueError("table must be an object")
        _require_exact_keys(data, _TABLE_KEYS, "table")
        return cls(
            id=_require_nonblank_str(data["id"], "id"),
            namespace_id=_require_nonblank_str(data["namespace_id"], "namespace_id"),
            name=_require_legal_snowflake_identifier(data["name"], "name"),
            kind=_require_nonblank_str(data["kind"], "kind"),
            columns=_require_tuple(data["columns"], "columns"),
            constraints=_require_tuple(data["constraints"], "constraints"),
            comment=_require_optional_str(data["comment"], "comment"),
        )


@dataclass(frozen=True)
class Relationship:
    """Canonical projection of a foreign key."""

    id: str
    name: str
    source_table_id: str
    source_column_ids: tuple[str, ...]
    target_table_id: str
    target_column_ids: tuple[str, ...]
    cardinality: str

    def __post_init__(self) -> None:
        _require_nonblank_str(self.id, "id")
        _require_nonblank_str(self.name, "name")
        _require_nonblank_str(self.source_table_id, "source_table_id")
        _require_nonblank_str(self.target_table_id, "target_table_id")
        cardinality = _require_nonblank_str(self.cardinality, "cardinality")
        if cardinality not in SUPPORTED_CARDINALITIES:
            raise ValueError(
                f"cardinality must be one of {sorted(SUPPORTED_CARDINALITIES)}"
            )

        source_column_ids = _require_tuple(self.source_column_ids, "source_column_ids")
        target_column_ids = _require_tuple(self.target_column_ids, "target_column_ids")
        if not source_column_ids:
            raise ValueError("source_column_ids must be a non-empty list")
        if len(source_column_ids) != len(target_column_ids):
            raise ValueError("source_column_ids and target_column_ids length must match")
        for index, column_id in enumerate(source_column_ids):
            _require_nonblank_str(column_id, f"source_column_ids[{index}]")
        for index, column_id in enumerate(target_column_ids):
            _require_nonblank_str(column_id, f"target_column_ids[{index}]")
        object.__setattr__(self, "source_column_ids", tuple(source_column_ids))
        object.__setattr__(self, "target_column_ids", tuple(target_column_ids))

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "source_table_id": self.source_table_id,
            "source_column_ids": list(self.source_column_ids),
            "target_table_id": self.target_table_id,
            "target_column_ids": list(self.target_column_ids),
            "cardinality": self.cardinality,
        }

    @classmethod
    def from_dict(cls, data: object) -> Relationship:
        if not isinstance(data, Mapping):
            raise ValueError("relationship must be an object")
        _require_exact_keys(data, _RELATIONSHIP_KEYS, "relationship")
        return cls(
            id=_require_nonblank_str(data["id"], "id"),
            name=_require_nonblank_str(data["name"], "name"),
            source_table_id=_require_nonblank_str(
                data["source_table_id"], "source_table_id"
            ),
            source_column_ids=_require_tuple(
                data["source_column_ids"], "source_column_ids"
            ),
            target_table_id=_require_nonblank_str(
                data["target_table_id"], "target_table_id"
            ),
            target_column_ids=_require_tuple(
                data["target_column_ids"], "target_column_ids"
            ),
            cardinality=_require_nonblank_str(data["cardinality"], "cardinality"),
        )


@dataclass(frozen=True)
class PhysicalModel:
    """Canonical physical model root object."""

    name: str
    model_version: str = "1"
    namespaces: tuple[Namespace, ...] = ()
    tables: tuple[Table, ...] = ()
    relationships: tuple[Relationship, ...] = ()

    def __post_init__(self) -> None:
        _require_nonblank_str(self.name, "name")
        model_version = _require_nonblank_str(self.model_version, "model_version")
        if model_version != "1":
            raise ValueError('model_version must be exactly "1"')

        namespaces = _coerce_namespace_tuple(self.namespaces, "namespaces")
        object.__setattr__(self, "namespaces", namespaces)
        _require_sorted_by_id(namespaces, "namespaces")
        namespace_ids = {namespace.id for namespace in namespaces}
        if len(namespace_ids) != len(namespaces):
            raise ValueError("namespaces must have unique ids")

        tables = _coerce_table_tuple(self.tables, "tables")
        object.__setattr__(self, "tables", tables)
        _require_sorted_by_id(tables, "tables")
        table_ids = {table.id for table in tables}
        if len(table_ids) != len(tables):
            raise ValueError("tables must have unique ids")

        for table in tables:
            if table.namespace_id not in namespace_ids:
                raise ValueError(
                    f"namespace_id references unknown namespace {table.namespace_id!r}"
                )
            expected_table_id = _table_id_from_namespace(
                table.namespace_id, table.name, namespaces
            )
            if table.id != expected_table_id:
                raise ValueError(f"id must equal {expected_table_id!r}")
            for column in table.columns:
                expected_column_id = f"column:{_path_from_table_id(table.id)}.{column.name}"
                if column.id != expected_column_id:
                    raise ValueError(f"id must equal {expected_column_id!r}")
            for constraint in table.constraints:
                if constraint.name is None:
                    raise ValueError("name is required for v1 constraints")
                expected_constraint_id = (
                    f"constraint:{_path_from_table_id(table.id)}.{constraint.name}"
                )
                if constraint.id != expected_constraint_id:
                    raise ValueError(f"id must equal {expected_constraint_id!r}")

        relationships = _coerce_relationship_tuple(self.relationships, "relationships")
        object.__setattr__(self, "relationships", relationships)
        _require_sorted_by_id(relationships, "relationships")
        relationship_ids = {relationship.id for relationship in relationships}
        if len(relationship_ids) != len(relationships):
            raise ValueError("relationships must have unique ids")

        tables_by_id = {table.id: table for table in tables}
        expected_relationships = _relationships_from_foreign_keys(tables)
        if list(relationships) != list(expected_relationships):
            raise ValueError(
                "relationships must match foreign_key constraints exactly"
            )

        for relationship in relationships:
            source = tables_by_id.get(relationship.source_table_id)
            target = tables_by_id.get(relationship.target_table_id)
            if source is None:
                raise ValueError(
                    "source_table_id references unknown table "
                    f"{relationship.source_table_id!r}"
                )
            if target is None:
                raise ValueError(
                    "target_table_id references unknown table "
                    f"{relationship.target_table_id!r}"
                )
            source_column_ids = {column.id for column in source.columns}
            target_column_ids = {column.id for column in target.columns}
            for column_id in relationship.source_column_ids:
                if column_id not in source_column_ids:
                    raise ValueError(
                        f"source_column_ids references unknown column {column_id!r}"
                    )
            for column_id in relationship.target_column_ids:
                if column_id not in target_column_ids:
                    raise ValueError(
                        f"target_column_ids references unknown column {column_id!r}"
                    )

        for table in tables:
            for constraint in table.constraints:
                if constraint.kind != "foreign_key":
                    continue
                if constraint.referenced_table_id not in table_ids:
                    raise ValueError(
                        "referenced_table_id references unknown table "
                        f"{constraint.referenced_table_id!r}"
                    )
                target = tables_by_id[constraint.referenced_table_id]
                target_column_ids = {column.id for column in target.columns}
                for column_id in constraint.referenced_columns:
                    if column_id not in target_column_ids:
                        raise ValueError(
                            "referenced_columns references unknown column "
                            f"{column_id!r}"
                        )

    def to_dict(self) -> dict[str, object]:
        return {
            "model_version": self.model_version,
            "name": self.name,
            "namespaces": [namespace.to_dict() for namespace in self.namespaces],
            "tables": [table.to_dict() for table in self.tables],
            "relationships": [
                relationship.to_dict() for relationship in self.relationships
            ],
        }

    @classmethod
    def from_dict(cls, data: object) -> PhysicalModel:
        if not isinstance(data, Mapping):
            raise ValueError("physical model must be an object")
        _require_exact_keys(data, _PHYSICAL_MODEL_KEYS, "physical model")
        return cls(
            name=_require_nonblank_str(data["name"], "name"),
            model_version=_require_nonblank_str(data["model_version"], "model_version"),
            namespaces=_require_tuple(data["namespaces"], "namespaces"),
            tables=_require_tuple(data["tables"], "tables"),
            relationships=_require_tuple(data["relationships"], "relationships"),
        )


def namespace_id(catalog: str, schema: str) -> str:
    return f"namespace:{catalog}.{schema}"


def table_id(catalog: str, schema: str, table_name: str) -> str:
    return f"table:{catalog}.{schema}.{table_name}"


def column_id(catalog: str, schema: str, table_name: str, column_name: str) -> str:
    return f"column:{_qualified_path(catalog, schema, table_name)}.{column_name}"


def constraint_id(
    catalog: str, schema: str, table_name: str, constraint_name: str
) -> str:
    return (
        f"constraint:{_qualified_path(catalog, schema, table_name)}.{constraint_name}"
    )


def relationship_id(
    catalog: str, schema: str, table_name: str, constraint_name: str
) -> str:
    return (
        f"relationship:{_qualified_path(catalog, schema, table_name)}.{constraint_name}"
    )


def _qualified_path(catalog: str, schema: str, table_name: str) -> str:
    return f"{catalog}.{schema}.{table_name}"


def _path_from_table_id(table_object_id: str) -> str:
    if not table_object_id.startswith("table:"):
        raise ValueError(f"id must be a table id, got {table_object_id!r}")
    return table_object_id.removeprefix("table:")


def _table_id_from_namespace(
    namespace_object_id: str,
    table_name: str,
    namespaces: Iterable[Namespace],
) -> str:
    for namespace in namespaces:
        if namespace.id == namespace_object_id:
            return table_id(namespace.catalog, namespace.schema, table_name)
    raise ValueError(f"namespace_id references unknown namespace {namespace_object_id!r}")


def _relationships_from_foreign_keys(tables: Sequence[Table]) -> tuple[Relationship, ...]:
    relationships: list[Relationship] = []
    for table in tables:
        path = _path_from_table_id(table.id)
        for constraint in table.constraints:
            if constraint.kind != "foreign_key":
                continue
            assert constraint.name is not None
            relationships.append(
                Relationship(
                    id=f"relationship:{path}.{constraint.name}",
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


def _coerce_namespace_tuple(value: object, field: str) -> tuple[Namespace, ...]:
    items = _require_tuple(value, field)
    result: list[Namespace] = []
    for index, item in enumerate(items):
        if isinstance(item, Mapping):
            item = Namespace.from_dict(item)
        _require_type(item, Namespace, f"{field}[{index}]")
        result.append(item)
    return tuple(result)


def _coerce_table_tuple(value: object, field: str) -> tuple[Table, ...]:
    items = _require_tuple(value, field)
    result: list[Table] = []
    for index, item in enumerate(items):
        if isinstance(item, Mapping):
            item = Table.from_dict(item)
        _require_type(item, Table, f"{field}[{index}]")
        result.append(item)
    return tuple(result)


def _coerce_relationship_tuple(value: object, field: str) -> tuple[Relationship, ...]:
    items = _require_tuple(value, field)
    result: list[Relationship] = []
    for index, item in enumerate(items):
        if isinstance(item, Mapping):
            item = Relationship.from_dict(item)
        _require_type(item, Relationship, f"{field}[{index}]")
        result.append(item)
    return tuple(result)
