import json
from dataclasses import FrozenInstanceError

import pytest

from erd_tool.model import (
    Column,
    DataType,
    Namespace,
    PhysicalModel,
    Relationship,
    Table,
    TableConstraint,
)


FORBIDDEN_PROVIDER_OR_UI_KEYS = {
    "account",
    "canvas",
    "connection",
    "edges",
    "nodes",
    "role",
    "session",
    "theme",
    "viewport",
    "warehouse",
}

NUMBER_38 = DataType(
    family="NUMBER",
    text="NUMBER(38, 0)",
    precision=38,
    scale=0,
    length=None,
)
VARCHAR_200 = DataType(
    family="VARCHAR",
    text="VARCHAR(200)",
    precision=None,
    scale=None,
    length=200,
)


def _namespace() -> Namespace:
    return Namespace(id="namespace:ANALYTICS.CORE", catalog="ANALYTICS", schema="CORE")


def _customer_table() -> Table:
    return Table(
        id="table:ANALYTICS.CORE.CUSTOMER",
        namespace_id="namespace:ANALYTICS.CORE",
        name="CUSTOMER",
        kind="table",
        columns=(
            Column(
                id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                name="CUSTOMER_ID",
                ordinal=1,
                data_type=NUMBER_38,
                nullable=False,
                default=None,
                comment=None,
            ),
            Column(
                id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
                name="CUSTOMER_NAME",
                ordinal=2,
                data_type=VARCHAR_200,
                nullable=False,
                default=None,
                comment=None,
            ),
        ),
        constraints=(
            TableConstraint(
                id="constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
                name="PK_CUSTOMER",
                kind="primary_key",
                columns=("column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",),
                referenced_table_id=None,
                referenced_columns=(),
            ),
        ),
        comment=None,
    )


def _minimal_model() -> PhysicalModel:
    return PhysicalModel(
        name="operations-domain-model",
        model_version="1",
        namespaces=(_namespace(),),
        tables=(_customer_table(),),
        relationships=(),
    )


def test_physical_model_imports_from_canonical_model_module() -> None:
    assert PhysicalModel.__module__ == "erd_tool.model"


def test_physical_model_accepts_stable_model_name() -> None:
    model = PhysicalModel(name="operations-domain-model")

    assert model.name == "operations-domain-model"
    assert model.model_version == "1"
    assert model.namespaces == ()
    assert model.tables == ()
    assert model.relationships == ()


def test_physical_model_serializes_to_provider_neutral_json_ready_dict() -> None:
    serialized = PhysicalModel(name="operations-domain-model").to_dict()

    assert serialized == {
        "model_version": "1",
        "name": "operations-domain-model",
        "namespaces": [],
        "tables": [],
        "relationships": [],
    }
    assert json.loads(json.dumps(serialized)) == serialized
    assert FORBIDDEN_PROVIDER_OR_UI_KEYS.isdisjoint(serialized)
    assert FORBIDDEN_PROVIDER_OR_UI_KEYS.isdisjoint(_all_keys(serialized))


def test_physical_model_is_immutable() -> None:
    model = _minimal_model()

    with pytest.raises(FrozenInstanceError):
        model.name = "changed"  # type: ignore[misc]


def test_physical_model_rejects_blank_name() -> None:
    with pytest.raises(ValueError, match="name"):
        PhysicalModel(name="   ")


def test_physical_model_rejects_unsupported_model_version() -> None:
    with pytest.raises(ValueError, match="model_version"):
        PhysicalModel(name="ops", model_version="2")


def test_physical_model_preserves_column_ordinal_order() -> None:
    model = _minimal_model()

    assert [column.name for column in model.tables[0].columns] == [
        "CUSTOMER_ID",
        "CUSTOMER_NAME",
    ]
    assert [column.ordinal for column in model.tables[0].columns] == [1, 2]


def test_physical_model_rejects_noncontiguous_column_ordinals() -> None:
    with pytest.raises(ValueError, match="ordinal"):
        Table(
            id="table:ANALYTICS.CORE.CUSTOMER",
            namespace_id="namespace:ANALYTICS.CORE",
            name="CUSTOMER",
            kind="table",
            columns=(
                Column(
                    id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                    name="CUSTOMER_ID",
                    ordinal=1,
                    data_type=NUMBER_38,
                    nullable=False,
                ),
                Column(
                    id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
                    name="CUSTOMER_NAME",
                    ordinal=3,
                    data_type=VARCHAR_200,
                    nullable=False,
                ),
            ),
        )


def test_physical_model_rejects_unsorted_table_ids() -> None:
    other = Table(
        id="table:ANALYTICS.CORE.ZZZ",
        namespace_id="namespace:ANALYTICS.CORE",
        name="ZZZ",
        kind="table",
        columns=(
            Column(
                id="column:ANALYTICS.CORE.ZZZ.ID",
                name="ID",
                ordinal=1,
                data_type=NUMBER_38,
                nullable=False,
            ),
        ),
    )
    first = _customer_table()

    with pytest.raises(ValueError, match="tables"):
        PhysicalModel(
            name="ops",
            namespaces=(_namespace(),),
            tables=(other, first),
        )


def test_physical_model_rejects_unsupported_type_family() -> None:
    with pytest.raises(ValueError, match="family"):
        DataType(family="VARIANT", text="VARIANT", precision=None, scale=None, length=None)


def test_physical_model_rejects_number_without_precision_scale() -> None:
    with pytest.raises(ValueError, match="precision|scale|NUMBER"):
        DataType(family="NUMBER", text="NUMBER", precision=None, scale=None, length=None)


def test_physical_model_rejects_unresolved_namespace_reference() -> None:
    with pytest.raises(ValueError, match="namespace_id"):
        PhysicalModel(
            name="ops",
            namespaces=(),
            tables=(_customer_table(),),
        )


def test_physical_model_rejects_foreign_key_relationship_mismatch() -> None:
    order = Table(
        id="table:ANALYTICS.CORE.ORDER_HEADER",
        namespace_id="namespace:ANALYTICS.CORE",
        name="ORDER_HEADER",
        kind="table",
        columns=(
            Column(
                id="column:ANALYTICS.CORE.ORDER_HEADER.ORDER_ID",
                name="ORDER_ID",
                ordinal=1,
                data_type=NUMBER_38,
                nullable=False,
            ),
            Column(
                id="column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
                name="CUSTOMER_ID",
                ordinal=2,
                data_type=NUMBER_38,
                nullable=False,
            ),
        ),
        constraints=(
            TableConstraint(
                id="constraint:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
                name="FK_ORDER_HEADER_CUSTOMER",
                kind="foreign_key",
                columns=("column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",),
                referenced_table_id="table:ANALYTICS.CORE.CUSTOMER",
                referenced_columns=("column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",),
            ),
            TableConstraint(
                id="constraint:ANALYTICS.CORE.ORDER_HEADER.PK_ORDER_HEADER",
                name="PK_ORDER_HEADER",
                kind="primary_key",
                columns=("column:ANALYTICS.CORE.ORDER_HEADER.ORDER_ID",),
            ),
        ),
    )

    with pytest.raises(ValueError, match="relationship"):
        PhysicalModel(
            name="ops",
            namespaces=(_namespace(),),
            tables=(_customer_table(), order),
            relationships=(),
        )


def test_physical_model_from_dict_round_trips_to_dict() -> None:
    model = _minimal_model()
    restored = PhysicalModel.from_dict(model.to_dict())

    assert restored == model
    assert restored.to_dict() == model.to_dict()


def test_physical_model_to_dict_key_order_is_stable() -> None:
    serialized = _minimal_model().to_dict()

    assert list(serialized) == [
        "model_version",
        "name",
        "namespaces",
        "tables",
        "relationships",
    ]
    assert list(serialized["namespaces"][0]) == ["id", "catalog", "schema"]
    assert list(serialized["tables"][0]) == [
        "id",
        "namespace_id",
        "name",
        "kind",
        "columns",
        "constraints",
        "comment",
    ]


def test_float_and_binary_canonical_type_text() -> None:
    float_type = DataType(
        family="FLOAT",
        text="FLOAT",
        precision=None,
        scale=None,
        length=None,
    )
    binary_type = DataType(
        family="BINARY",
        text="BINARY(8388608)",
        precision=None,
        scale=None,
        length=8388608,
    )

    assert float_type.to_dict() == {
        "family": "FLOAT",
        "text": "FLOAT",
        "precision": None,
        "scale": None,
        "length": None,
    }
    assert binary_type.to_dict() == {
        "family": "BINARY",
        "text": "BINARY(8388608)",
        "precision": None,
        "scale": None,
        "length": 8388608,
    }


def test_float_rejects_parameters() -> None:
    with pytest.raises(ValueError, match="precision|scale|length|FLOAT"):
        DataType(
            family="FLOAT",
            text="FLOAT",
            precision=1,
            scale=None,
            length=None,
        )


def test_binary_requires_length_and_exact_text() -> None:
    with pytest.raises(ValueError, match="length"):
        DataType(
            family="BINARY",
            text="BINARY",
            precision=None,
            scale=None,
            length=None,
        )
    with pytest.raises(ValueError, match="text"):
        DataType(
            family="BINARY",
            text="BINARY(16)",
            precision=None,
            scale=None,
            length=32,
        )


def test_number_accepts_precision_and_scale_bounds() -> None:
    assert DataType(
        family="NUMBER",
        text="NUMBER(1, 0)",
        precision=1,
        scale=0,
        length=None,
    ).text == "NUMBER(1, 0)"
    assert DataType(
        family="NUMBER",
        text="NUMBER(10, 10)",
        precision=10,
        scale=10,
        length=None,
    ).text == "NUMBER(10, 10)"
    assert DataType(
        family="NUMBER",
        text="NUMBER(38, 37)",
        precision=38,
        scale=37,
        length=None,
    ).text == "NUMBER(38, 37)"
    assert DataType(
        family="NUMBER",
        text="NUMBER(38, 0)",
        precision=38,
        scale=0,
        length=None,
    ).text == "NUMBER(38, 0)"


def test_number_rejects_out_of_range_precision_or_scale() -> None:
    with pytest.raises(ValueError, match="precision"):
        DataType(
            family="NUMBER",
            text="NUMBER(0, 0)",
            precision=0,
            scale=0,
            length=None,
        )
    with pytest.raises(ValueError, match="precision"):
        DataType(
            family="NUMBER",
            text="NUMBER(39, 0)",
            precision=39,
            scale=0,
            length=None,
        )
    with pytest.raises(ValueError, match="scale"):
        DataType(
            family="NUMBER",
            text="NUMBER(10, -1)",
            precision=10,
            scale=-1,
            length=None,
        )
    with pytest.raises(ValueError, match="scale"):
        DataType(
            family="NUMBER",
            text="NUMBER(38, 38)",
            precision=38,
            scale=38,
            length=None,
        )
    with pytest.raises(ValueError, match="scale"):
        DataType(
            family="NUMBER",
            text="NUMBER(10, 11)",
            precision=10,
            scale=11,
            length=None,
        )


def test_varchar_accepts_length_bounds() -> None:
    assert DataType(
        family="VARCHAR",
        text="VARCHAR(1)",
        precision=None,
        scale=None,
        length=1,
    ).length == 1
    assert DataType(
        family="VARCHAR",
        text="VARCHAR(16777216)",
        precision=None,
        scale=None,
        length=16777216,
    ).length == 16777216


def test_varchar_rejects_out_of_range_length() -> None:
    with pytest.raises(ValueError, match="length"):
        DataType(
            family="VARCHAR",
            text="VARCHAR(0)",
            precision=None,
            scale=None,
            length=0,
        )
    with pytest.raises(ValueError, match="length"):
        DataType(
            family="VARCHAR",
            text="VARCHAR(16777217)",
            precision=None,
            scale=None,
            length=16777217,
        )


def test_timestamp_ntz_accepts_precision_bounds() -> None:
    assert DataType(
        family="TIMESTAMP_NTZ",
        text="TIMESTAMP_NTZ(0)",
        precision=0,
        scale=None,
        length=None,
    ).precision == 0
    assert DataType(
        family="TIMESTAMP_NTZ",
        text="TIMESTAMP_NTZ(9)",
        precision=9,
        scale=None,
        length=None,
    ).precision == 9


def test_timestamp_ntz_rejects_out_of_range_precision() -> None:
    with pytest.raises(ValueError, match="precision"):
        DataType(
            family="TIMESTAMP_NTZ",
            text="TIMESTAMP_NTZ(-1)",
            precision=-1,
            scale=None,
            length=None,
        )
    with pytest.raises(ValueError, match="precision"):
        DataType(
            family="TIMESTAMP_NTZ",
            text="TIMESTAMP_NTZ(10)",
            precision=10,
            scale=None,
            length=None,
        )


def test_binary_accepts_length_bounds() -> None:
    assert DataType(
        family="BINARY",
        text="BINARY(1)",
        precision=None,
        scale=None,
        length=1,
    ).length == 1
    assert DataType(
        family="BINARY",
        text="BINARY(8388608)",
        precision=None,
        scale=None,
        length=8388608,
    ).length == 8388608


def test_binary_rejects_out_of_range_length() -> None:
    with pytest.raises(ValueError, match="length"):
        DataType(
            family="BINARY",
            text="BINARY(0)",
            precision=None,
            scale=None,
            length=0,
        )
    with pytest.raises(ValueError, match="length"):
        DataType(
            family="BINARY",
            text="BINARY(8388609)",
            precision=None,
            scale=None,
            length=8388609,
        )


def test_date_and_boolean_reject_parameters() -> None:
    with pytest.raises(ValueError, match="precision|scale|length|DATE"):
        DataType(
            family="DATE",
            text="DATE",
            precision=1,
            scale=None,
            length=None,
        )
    with pytest.raises(ValueError, match="precision|scale|length|BOOLEAN"):
        DataType(
            family="BOOLEAN",
            text="BOOLEAN",
            precision=None,
            scale=None,
            length=1,
        )


def test_from_dict_rejects_missing_required_physical_model_fields() -> None:
    with pytest.raises(ValueError, match="model_version"):
        PhysicalModel.from_dict({"name": "ops"})
    with pytest.raises(ValueError, match="namespaces|tables|relationships"):
        PhysicalModel.from_dict({"model_version": "1", "name": "ops"})


def test_from_dict_rejects_unexpected_fields() -> None:
    payload = _minimal_model().to_dict()
    payload["account"] = "x"
    with pytest.raises(ValueError, match="unexpected|account"):
        PhysicalModel.from_dict(payload)

    column = payload["tables"][0]["columns"][0]
    column["session"] = True
    with pytest.raises(ValueError, match="unexpected|session"):
        Column.from_dict(column)


def test_from_dict_does_not_default_absent_collections() -> None:
    with pytest.raises(ValueError, match="namespaces|tables|relationships"):
        PhysicalModel.from_dict(
            {
                "model_version": "1",
                "name": "ops",
                "namespaces": [],
                "tables": [],
            }
        )


def test_direct_physical_model_empty_defaults_still_work() -> None:
    model = PhysicalModel(name="smoke")

    assert model.to_dict() == {
        "model_version": "1",
        "name": "smoke",
        "namespaces": [],
        "tables": [],
        "relationships": [],
    }


def test_canonical_identifiers_reject_lower_hyphen_digit_whitespace() -> None:
    with pytest.raises(ValueError, match="identifier|catalog|name"):
        Namespace(id="namespace:analytics.CORE", catalog="analytics", schema="CORE")
    with pytest.raises(ValueError, match="identifier|schema|name"):
        Namespace(id="namespace:ANALYTICS.CORE-1", catalog="ANALYTICS", schema="CORE-1")
    with pytest.raises(ValueError, match="identifier|name"):
        Table(
            id="table:ANALYTICS.CORE.1BAD",
            namespace_id="namespace:ANALYTICS.CORE",
            name="1BAD",
            kind="table",
            columns=(
                Column(
                    id="column:ANALYTICS.CORE.1BAD.ID",
                    name="ID",
                    ordinal=1,
                    data_type=NUMBER_38,
                    nullable=False,
                ),
            ),
        )
    with pytest.raises(ValueError, match="identifier|name"):
        Column(
            id="column:ANALYTICS.CORE.CUSTOMER. BAD",
            name=" BAD",
            ordinal=1,
            data_type=NUMBER_38,
            nullable=False,
        )
    with pytest.raises(ValueError, match="identifier|name"):
        TableConstraint(
            id="constraint:ANALYTICS.CORE.CUSTOMER.pk_customer",
            name="pk_customer",
            kind="primary_key",
            columns=("column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",),
        )


def test_canonical_path_ids_remain_exact_for_legal_identifiers() -> None:
    namespace = Namespace(
        id="namespace:ANALYTICS.CORE", catalog="ANALYTICS", schema="CORE"
    )
    table = Table(
        id="table:ANALYTICS.CORE.CUSTOMER",
        namespace_id=namespace.id,
        name="CUSTOMER",
        kind="table",
        columns=(
            Column(
                id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                name="CUSTOMER_ID",
                ordinal=1,
                data_type=NUMBER_38,
                nullable=False,
                default="'x'",
                comment="note with spaces",
            ),
        ),
        constraints=(
            TableConstraint(
                id="constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
                name="PK_CUSTOMER",
                kind="primary_key",
                columns=("column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",),
            ),
        ),
        comment="table comment",
    )
    model = PhysicalModel(
        name="ops-model-with-hyphen",
        namespaces=(namespace,),
        tables=(table,),
    )
    assert model.namespaces[0].id == "namespace:ANALYTICS.CORE"
    assert model.tables[0].id == "table:ANALYTICS.CORE.CUSTOMER"
    assert model.tables[0].columns[0].id == "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"
    assert model.tables[0].columns[0].comment == "note with spaces"
    assert model.name == "ops-model-with-hyphen"


def test_project_load_render_reimport_preserves_legal_identifiers() -> None:
    from erd_tool.project_serialization import load_project_model, save_project_model
    from erd_tool.snowflake import import_snowflake_ddl, render_snowflake_ddl

    original = _minimal_model()
    loaded = load_project_model(save_project_model(original))
    rendered = render_snowflake_ddl(loaded)
    reimported = import_snowflake_ddl(rendered, model_name=original.name)
    assert reimported.to_dict() == loaded.to_dict()
    assert reimported.namespaces[0].catalog == "ANALYTICS"
    assert reimported.tables[0].name == "CUSTOMER"


def test_table_constraint_rejects_duplicate_column_ids() -> None:
    with pytest.raises(ValueError, match="columns must have unique ids"):
        TableConstraint(
            id="constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
            name="PK_CUSTOMER",
            kind="primary_key",
            columns=(
                "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            ),
        )


def test_table_constraint_rejects_duplicate_referenced_column_ids() -> None:
    with pytest.raises(ValueError, match="referenced_columns must have unique ids"):
        TableConstraint(
            id="constraint:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
            name="FK_ORDER_HEADER_CUSTOMER",
            kind="foreign_key",
            columns=(
                "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
                "column:ANALYTICS.CORE.ORDER_HEADER.BILLING_CUSTOMER_ID",
            ),
            referenced_table_id="table:ANALYTICS.CORE.CUSTOMER",
            referenced_columns=(
                "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            ),
        )


def test_table_rejects_multiple_primary_key_constraints() -> None:
    with pytest.raises(
        ValueError, match="at most one primary_key constraint"
    ):
        Table(
            id="table:ANALYTICS.CORE.CUSTOMER",
            namespace_id="namespace:ANALYTICS.CORE",
            name="CUSTOMER",
            kind="table",
            columns=(
                Column(
                    id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                    name="CUSTOMER_ID",
                    ordinal=1,
                    data_type=NUMBER_38,
                    nullable=False,
                ),
                Column(
                    id="column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_CODE",
                    name="CUSTOMER_CODE",
                    ordinal=2,
                    data_type=VARCHAR_200,
                    nullable=False,
                ),
            ),
            constraints=(
                TableConstraint(
                    id="constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
                    name="PK_CUSTOMER",
                    kind="primary_key",
                    columns=("column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",),
                ),
                TableConstraint(
                    id="constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER_CODE",
                    name="PK_CUSTOMER_CODE",
                    kind="primary_key",
                    columns=("column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_CODE",),
                ),
            ),
        )


def test_namespace_requires_non_null_legal_catalog_and_schema() -> None:
    with pytest.raises(ValueError, match="catalog"):
        Namespace(id="namespace:-.CORE", catalog=None, schema="CORE")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="schema"):
        Namespace(id="namespace:ANALYTICS.-", catalog="ANALYTICS", schema=None)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="catalog"):
        Namespace.from_dict(
            {"id": "namespace:-.CORE", "catalog": None, "schema": "CORE"}
        )
    with pytest.raises(ValueError, match="schema"):
        Namespace.from_dict(
            {"id": "namespace:ANALYTICS.-", "catalog": "ANALYTICS", "schema": None}
        )


def test_empty_physical_model_may_have_zero_namespaces() -> None:
    model = PhysicalModel(name="empty")
    assert model.namespaces == ()
    assert model.to_dict()["namespaces"] == []


def test_project_load_rejects_duplicate_pk_columns_and_multiple_pks() -> None:
    from erd_tool.project_serialization import (
        ProjectSerializationError,
        load_project,
        save_project_model,
    )

    project_data = save_project_model(_minimal_model())
    duplicate_columns = project_data["physical_model"]["tables"][0]["constraints"][0]
    duplicate_columns["columns"] = [
        "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
        "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ]
    with pytest.raises(
        ProjectSerializationError, match="columns must have unique ids"
    ):
        load_project(project_data)

    project_data = save_project_model(_minimal_model())
    table = project_data["physical_model"]["tables"][0]
    table["constraints"] = [
        {
            "id": "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
            "name": "PK_CUSTOMER",
            "kind": "primary_key",
            "columns": ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
            "referenced_table_id": None,
            "referenced_columns": [],
        },
        {
            "id": "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER_NAME",
            "name": "PK_CUSTOMER_NAME",
            "kind": "primary_key",
            "columns": ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME"],
            "referenced_table_id": None,
            "referenced_columns": [],
        },
    ]
    with pytest.raises(
        ProjectSerializationError, match="at most one primary_key constraint"
    ):
        load_project(project_data)


def test_project_load_rejects_null_namespace_catalog_or_schema() -> None:
    from erd_tool.project_serialization import (
        ProjectSerializationError,
        load_project,
        save_project_model,
    )

    project_data = save_project_model(_minimal_model())
    project_data["physical_model"]["namespaces"][0]["catalog"] = None
    with pytest.raises(ProjectSerializationError, match="catalog"):
        load_project(project_data)

    project_data = save_project_model(_minimal_model())
    project_data["physical_model"]["namespaces"][0]["schema"] = None
    with pytest.raises(ProjectSerializationError, match="schema"):
        load_project(project_data)


def _all_keys(value: object) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        keys.update(str(key) for key in value)
        for nested in value.values():
            keys.update(_all_keys(nested))
    elif isinstance(value, list):
        for nested in value:
            keys.update(_all_keys(nested))
    return keys
