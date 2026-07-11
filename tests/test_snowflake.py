from __future__ import annotations

import json
from pathlib import Path

import pytest

from erd_tool.model import PhysicalModel
from erd_tool.snowflake import (
    SnowflakeDDLImportError,
    import_snowflake_ddl,
    render_snowflake_ddl,
)


FIXTURES = Path(__file__).resolve().parents[1] / "docs" / "fixtures"
SQL_FIXTURE = FIXTURES / "snowflake_round_trip_v1.sql"
JSON_FIXTURE = FIXTURES / "snowflake_round_trip_v1.json"
MODEL_NAME = "snowflake-round-trip-v1"


def _expected_canonical() -> dict[str, object]:
    return json.loads(JSON_FIXTURE.read_text(encoding="utf-8"))


def test_import_snowflake_ddl_matches_checked_in_canonical_json() -> None:
    sql = SQL_FIXTURE.read_text(encoding="utf-8")
    expected = _expected_canonical()

    model = import_snowflake_ddl(sql, model_name=MODEL_NAME)

    assert model.to_dict() == expected
    assert json.loads(json.dumps(model.to_dict())) == expected


def test_render_snowflake_ddl_reimports_to_identical_canonical_model() -> None:
    sql = SQL_FIXTURE.read_text(encoding="utf-8")
    original = import_snowflake_ddl(sql, model_name=MODEL_NAME)

    rendered = render_snowflake_ddl(original)
    reimported = import_snowflake_ddl(rendered, model_name=MODEL_NAME)

    assert reimported == original
    assert reimported.to_dict() == original.to_dict()
    assert reimported.to_dict() == _expected_canonical()


def test_render_snowflake_ddl_is_deterministic() -> None:
    model = import_snowflake_ddl(
        SQL_FIXTURE.read_text(encoding="utf-8"),
        model_name=MODEL_NAME,
    )

    assert render_snowflake_ddl(model) == render_snowflake_ddl(model)


def test_canonical_json_fixture_is_json_round_trippable() -> None:
    expected = _expected_canonical()

    assert json.loads(json.dumps(expected)) == expected
    assert PhysicalModel.from_dict(expected).to_dict() == expected


def test_import_rejects_unsupported_type() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.CUSTOMER (
        CUSTOMER_ID VARIANT NOT NULL
    );
    """

    with pytest.raises(SnowflakeDDLImportError, match="VARIANT|unsupported|type"):
        import_snowflake_ddl(sql, model_name=MODEL_NAME)


def test_import_rejects_quoted_identifier() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE."Customer" (
        CUSTOMER_ID NUMBER(38, 0) NOT NULL
    );
    """

    # Quoted identifiers are rejected by unquoted identifier grammar, not a
    # global scan (which would also reject " inside DEFAULT/COMMENT strings).
    with pytest.raises(SnowflakeDDLImportError, match="malformed CREATE TABLE"):
        import_snowflake_ddl(sql, model_name=MODEL_NAME)


def test_import_rejects_unresolved_foreign_key() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.ORDER_HEADER (
        ORDER_ID NUMBER(38, 0) NOT NULL,
        CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_ORDER_HEADER PRIMARY KEY (ORDER_ID),
        CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY (CUSTOMER_ID)
            REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID)
    );
    """

    with pytest.raises(SnowflakeDDLImportError, match="CUSTOMER|unresolved|reference"):
        import_snowflake_ddl(sql, model_name=MODEL_NAME)


def test_import_rejects_unsupported_statement() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE VIEW ANALYTICS.CORE.CUSTOMER_V AS SELECT 1 AS ID;
    """

    with pytest.raises(SnowflakeDDLImportError, match="VIEW|unsupported|statement"):
        import_snowflake_ddl(sql, model_name=MODEL_NAME)


def test_import_rejects_empty_sql() -> None:
    with pytest.raises(SnowflakeDDLImportError, match="empty"):
        import_snowflake_ddl("   \n  ", model_name=MODEL_NAME)


def test_float_and_binary_round_trip() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        MEASURE FLOAT,
        PAYLOAD BINARY(16),
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED
    );
    """

    model = import_snowflake_ddl(sql, model_name="float-binary")
    column_types = {column.name: column.data_type for column in model.tables[0].columns}

    assert column_types["MEASURE"].family == "FLOAT"
    assert column_types["MEASURE"].text == "FLOAT"
    assert column_types["PAYLOAD"].family == "BINARY"
    assert column_types["PAYLOAD"].text == "BINARY(16)"
    assert column_types["PAYLOAD"].length == 16

    rendered = render_snowflake_ddl(model)
    assert "MEASURE FLOAT" in rendered
    assert "PAYLOAD BINARY(16)" in rendered
    assert "NOT ENFORCED" in rendered
    assert "RELY" not in rendered.upper().replace("NOT ENFORCED", "")

    reimported = import_snowflake_ddl(rendered, model_name="float-binary")
    assert reimported.to_dict() == model.to_dict()


def test_informational_constraints_emit_not_enforced_and_round_trip() -> None:
    sql = SQL_FIXTURE.read_text(encoding="utf-8")
    original = import_snowflake_ddl(sql, model_name=MODEL_NAME)

    rendered = render_snowflake_ddl(original)

    assert "PRIMARY KEY" in rendered
    assert "FOREIGN KEY" in rendered
    assert rendered.count("NOT ENFORCED") >= 3
    assert " RELY" not in rendered.upper()
    assert "RELY" not in rendered.upper().replace("NOT ENFORCED", "")
    assert "ALTER TABLE" in rendered
    assert "FOREIGN KEY" not in _create_table_bodies(rendered)

    reimported = import_snowflake_ddl(rendered, model_name=MODEL_NAME)
    assert reimported.to_dict() == original.to_dict()
    assert reimported.to_dict() == _expected_canonical()


def test_string_default_with_comma_and_semicolon_round_trips() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        LABEL VARCHAR(50) DEFAULT 'a,b',
        NOTE VARCHAR(50) DEFAULT 'a;b',
        ESCAPED VARCHAR(50) DEFAULT 'it''s fine',
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED
    );
    """

    model = import_snowflake_ddl(sql, model_name="string-defaults")
    defaults = {column.name: column.default for column in model.tables[0].columns}

    assert defaults["LABEL"] == "'a,b'"
    assert defaults["NOTE"] == "'a;b'"
    assert defaults["ESCAPED"] == "'it''s fine'"

    rendered = render_snowflake_ddl(model)
    assert "DEFAULT 'a,b'" in rendered
    assert "DEFAULT 'a;b'" in rendered
    assert "DEFAULT 'it''s fine'" in rendered

    reimported = import_snowflake_ddl(rendered, model_name="string-defaults")
    assert reimported.to_dict() == model.to_dict()


def test_import_rejects_unterminated_string_default() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        LABEL VARCHAR(50) DEFAULT 'oops
    );
    """

    with pytest.raises(SnowflakeDDLImportError, match="unterminated|string|quote"):
        import_snowflake_ddl(sql, model_name="bad-string")


def test_import_rejects_unbalanced_parentheses() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID
    );
    """

    with pytest.raises(SnowflakeDDLImportError, match="unmatched|unbalanced|parenthes"):
        import_snowflake_ddl(sql, model_name="bad-parens")


def test_import_rejects_out_of_range_type_bounds() -> None:
    base = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID {type_sql} NOT NULL
    );
    """
    cases = [
        "NUMBER(39, 0)",
        "NUMBER(38, 38)",
        "NUMBER(10, 11)",
        "VARCHAR(0)",
        "VARCHAR(16777217)",
        "TIMESTAMP_NTZ(10)",
        "BINARY(0)",
        "BINARY(8388609)",
    ]
    for type_sql in cases:
        with pytest.raises(SnowflakeDDLImportError, match="precision|scale|length"):
            import_snowflake_ddl(
                base.format(type_sql=type_sql),
                model_name="bad-bounds",
            )


def test_number_scale_equal_to_precision_round_trips() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        AMOUNT NUMBER(10, 10) NOT NULL,
        CONSTRAINT PK_SAMPLE PRIMARY KEY (AMOUNT) NOT ENFORCED
    );
    """
    model = import_snowflake_ddl(sql, model_name="number-scale")
    assert model.tables[0].columns[0].data_type.text == "NUMBER(10, 10)"
    reimported = import_snowflake_ddl(
        render_snowflake_ddl(model), model_name="number-scale"
    )
    assert reimported.to_dict() == model.to_dict()


def test_date_default_current_date_function_round_trips() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        CREATED_ON DATE DEFAULT CURRENT_DATE(),
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED
    );
    """
    model = import_snowflake_ddl(sql, model_name="date-default")
    column = next(col for col in model.tables[0].columns if col.name == "CREATED_ON")
    assert column.data_type.family == "DATE"
    assert column.default == "CURRENT_DATE()"
    reimported = import_snowflake_ddl(
        render_snowflake_ddl(model), model_name="date-default"
    )
    assert reimported.to_dict() == model.to_dict()


def test_default_literal_containing_not_null_round_trips() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        LABEL VARCHAR(20) DEFAULT 'NOT NULL',
        NOTE VARCHAR(20) DEFAULT 'a,b;c''d' NOT NULL,
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED
    );
    """
    model = import_snowflake_ddl(sql, model_name="default-not-null-text")
    defaults = {column.name: column.default for column in model.tables[0].columns}
    nullability = {column.name: column.nullable for column in model.tables[0].columns}
    assert defaults["LABEL"] == "'NOT NULL'"
    assert nullability["LABEL"] is True
    assert defaults["NOTE"] == "'a,b;c''d'"
    assert nullability["NOTE"] is False
    reimported = import_snowflake_ddl(
        render_snowflake_ddl(model), model_name="default-not-null-text"
    )
    assert reimported.to_dict() == model.to_dict()


def test_import_rejects_unsupported_column_clause_leftover() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL COLLATE 'en'
    );
    """
    with pytest.raises(SnowflakeDDLImportError, match="unsupported column clause|COLLATE"):
        import_snowflake_ddl(sql, model_name="bad-clause")


def test_self_foreign_key_render_reimport_round_trip() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.EMPLOYEE (
        EMPLOYEE_ID NUMBER(38, 0) NOT NULL,
        MANAGER_ID NUMBER(38, 0),
        CONSTRAINT PK_EMPLOYEE PRIMARY KEY (EMPLOYEE_ID) NOT ENFORCED,
        CONSTRAINT FK_EMPLOYEE_MANAGER FOREIGN KEY (MANAGER_ID)
            REFERENCES ANALYTICS.CORE.EMPLOYEE (EMPLOYEE_ID) NOT ENFORCED
    );
    """

    original = import_snowflake_ddl(sql, model_name="self-fk")
    rendered = render_snowflake_ddl(original)

    assert "ALTER TABLE ANALYTICS.CORE.EMPLOYEE ADD CONSTRAINT FK_EMPLOYEE_MANAGER" in rendered
    assert "FOREIGN KEY" not in _create_table_bodies(rendered)

    reimported = import_snowflake_ddl(rendered, model_name="self-fk")
    assert reimported.to_dict() == original.to_dict()


def test_cyclic_foreign_keys_render_reimport_round_trip() -> None:
    bootstrap = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.ALPHA (
        ALPHA_ID NUMBER(38, 0) NOT NULL,
        BETA_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_ALPHA PRIMARY KEY (ALPHA_ID) NOT ENFORCED
    );
    CREATE TABLE ANALYTICS.CORE.BETA (
        BETA_ID NUMBER(38, 0) NOT NULL,
        ALPHA_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_BETA PRIMARY KEY (BETA_ID) NOT ENFORCED
    );
    ALTER TABLE ANALYTICS.CORE.ALPHA ADD CONSTRAINT FK_ALPHA_BETA
        FOREIGN KEY (BETA_ID) REFERENCES ANALYTICS.CORE.BETA (BETA_ID) NOT ENFORCED;
    ALTER TABLE ANALYTICS.CORE.BETA ADD CONSTRAINT FK_BETA_ALPHA
        FOREIGN KEY (ALPHA_ID) REFERENCES ANALYTICS.CORE.ALPHA (ALPHA_ID) NOT ENFORCED;
    """

    original = import_snowflake_ddl(bootstrap, model_name="cycle-fk")
    assert len(original.relationships) == 2

    rendered = render_snowflake_ddl(original)
    assert rendered.count("ALTER TABLE") == 2
    assert "FOREIGN KEY" not in _create_table_bodies(rendered)
    assert "CREATE TABLE ANALYTICS.CORE.ALPHA" in rendered
    assert "CREATE TABLE ANALYTICS.CORE.BETA" in rendered

    reimported = import_snowflake_ddl(rendered, model_name="cycle-fk")
    assert reimported.to_dict() == original.to_dict()


def test_table_and_column_comment_semantic_round_trip() -> None:
    from erd_tool.model import (
        Column,
        DataType,
        Namespace,
        PhysicalModel,
        Table,
        TableConstraint,
    )

    number = DataType(
        family="NUMBER",
        text="NUMBER(38, 0)",
        precision=38,
        scale=0,
        length=None,
    )
    varchar = DataType(
        family="VARCHAR",
        text="VARCHAR(100)",
        precision=None,
        scale=None,
        length=100,
    )
    table_comment = "table note: DEFAULT, NOT NULL; commas, and it's quoted"
    # Canonical comment stores exact text; DDL escaping doubles embedded quotes.
    column_comment_canonical = "col note: a,b;c'd and NOT NULL / DEFAULT"

    model = PhysicalModel(
        name="comment-round-trip",
        namespaces=(
            Namespace(id="namespace:ANALYTICS.CORE", catalog="ANALYTICS", schema="CORE"),
        ),
        tables=(
            Table(
                id="table:ANALYTICS.CORE.SAMPLE",
                namespace_id="namespace:ANALYTICS.CORE",
                name="SAMPLE",
                kind="table",
                columns=(
                    Column(
                        id="column:ANALYTICS.CORE.SAMPLE.ID",
                        name="ID",
                        ordinal=1,
                        data_type=number,
                        nullable=False,
                        default=None,
                        comment=None,
                    ),
                    Column(
                        id="column:ANALYTICS.CORE.SAMPLE.NOTE",
                        name="NOTE",
                        ordinal=2,
                        data_type=varchar,
                        nullable=True,
                        default=None,
                        comment=column_comment_canonical,
                    ),
                    Column(
                        id="column:ANALYTICS.CORE.SAMPLE.LABEL",
                        name="LABEL",
                        ordinal=3,
                        data_type=varchar,
                        nullable=False,
                        default="'DEFAULT'",
                        comment="says DEFAULT and NOT NULL, with; punctuation",
                    ),
                ),
                constraints=(
                    TableConstraint(
                        id="constraint:ANALYTICS.CORE.SAMPLE.PK_SAMPLE",
                        name="PK_SAMPLE",
                        kind="primary_key",
                        columns=("column:ANALYTICS.CORE.SAMPLE.ID",),
                    ),
                ),
                comment=table_comment,
            ),
        ),
    )

    rendered = render_snowflake_ddl(model)
    assert render_snowflake_ddl(model) == rendered
    assert "COMMENT='table note: DEFAULT, NOT NULL; commas, and it''s quoted'" in rendered
    assert "COMMENT 'col note: a,b;c''d and NOT NULL / DEFAULT'" in rendered
    assert (
        "COMMENT 'says DEFAULT and NOT NULL, with; punctuation'" in rendered
    )

    reimported = import_snowflake_ddl(rendered, model_name="comment-round-trip")
    assert reimported.to_dict() == model.to_dict()
    assert reimported.tables[0].comment == table_comment
    assert reimported.tables[0].columns[1].comment == column_comment_canonical
    assert (
        reimported.tables[0].columns[2].comment
        == "says DEFAULT and NOT NULL, with; punctuation"
    )


def test_import_column_and_table_comments_from_ddl() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL COMMENT 'id''s key',
        NOTE VARCHAR(50) DEFAULT 'NOT NULL' COMMENT 'a,b;c''d',
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED
    ) COMMENT='table: DEFAULT; NOT NULL, and it''s fine';
    """
    model = import_snowflake_ddl(sql, model_name="comment-import")
    assert model.tables[0].comment == "table: DEFAULT; NOT NULL, and it's fine"
    comments = {column.name: column.comment for column in model.tables[0].columns}
    defaults = {column.name: column.default for column in model.tables[0].columns}
    assert comments["ID"] == "id's key"
    assert comments["NOTE"] == "a,b;c'd"
    assert defaults["NOTE"] == "'NOT NULL'"
    reimported = import_snowflake_ddl(
        render_snowflake_ddl(model), model_name="comment-import"
    )
    assert reimported.to_dict() == model.to_dict()


def test_string_literals_with_embedded_double_quotes_round_trip() -> None:
    """Double quotes inside single-quoted DEFAULT/COMMENT must import and render."""
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        LABEL VARCHAR(50) DEFAULT 'x"y',
        NOTE VARCHAR(50) COMMENT 'a "b"',
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED
    ) COMMENT='table "note"';
    """
    model = import_snowflake_ddl(sql, model_name="embedded-dq")
    columns = {column.name: column for column in model.tables[0].columns}
    assert columns["LABEL"].default == "'x\"y'"
    assert columns["NOTE"].comment == 'a "b"'
    assert model.tables[0].comment == 'table "note"'

    rendered = render_snowflake_ddl(model)
    assert "DEFAULT 'x\"y'" in rendered
    assert "COMMENT 'a \"b\"'" in rendered
    assert "COMMENT='table \"note\"'" in rendered

    reimported = import_snowflake_ddl(rendered, model_name="embedded-dq")
    assert reimported.to_dict() == model.to_dict()


def test_import_still_rejects_quoted_identifiers_in_identifier_positions() -> None:
    quoted_column = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        "ID" NUMBER(38, 0) NOT NULL
    );
    """
    with pytest.raises(SnowflakeDDLImportError, match="malformed column|quoted"):
        import_snowflake_ddl(quoted_column, model_name="quoted-col")

    quoted_pk_list = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_SAMPLE PRIMARY KEY ("ID") NOT ENFORCED
    );
    """
    with pytest.raises(
        SnowflakeDDLImportError, match="quoted identifiers are not supported"
    ):
        import_snowflake_ddl(quoted_pk_list, model_name="quoted-pk")


def test_import_alter_fk_rejects_unknown_table_and_bad_forms() -> None:
    missing_owner = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.CUSTOMER (
        CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID) NOT ENFORCED
    );
    ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_MISSING
        FOREIGN KEY (CUSTOMER_ID) REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID) NOT ENFORCED;
    """
    with pytest.raises(SnowflakeDDLImportError, match="ORDER_HEADER|unknown|unresolved"):
        import_snowflake_ddl(missing_owner, model_name="alter-missing")

    missing_not_enforced = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.CUSTOMER (
        CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID) NOT ENFORCED
    );
    CREATE TABLE ANALYTICS.CORE.ORDER_HEADER (
        ORDER_ID NUMBER(38, 0) NOT NULL,
        CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_ORDER_HEADER PRIMARY KEY (ORDER_ID) NOT ENFORCED
    );
    ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER
        FOREIGN KEY (CUSTOMER_ID) REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID);
    """
    with pytest.raises(SnowflakeDDLImportError, match="NOT ENFORCED|unsupported|ALTER"):
        import_snowflake_ddl(missing_not_enforced, model_name="alter-enforced")


def test_import_rejects_duplicate_primary_key_columns() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID, ID) NOT ENFORCED
    );
    """
    with pytest.raises(
        SnowflakeDDLImportError, match="columns must be unique|PK_SAMPLE"
    ):
        import_snowflake_ddl(sql, model_name="dup-pk-cols")


def test_import_rejects_multiple_inline_primary_key_constraints() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.SAMPLE (
        ID NUMBER(38, 0) NOT NULL,
        CODE VARCHAR(20) NOT NULL,
        CONSTRAINT PK_SAMPLE PRIMARY KEY (ID) NOT ENFORCED,
        CONSTRAINT PK_SAMPLE_CODE PRIMARY KEY (CODE) NOT ENFORCED
    );
    """
    with pytest.raises(
        SnowflakeDDLImportError, match="at most one primary_key constraint"
    ):
        import_snowflake_ddl(sql, model_name="multi-pk")


def test_import_rejects_duplicate_foreign_key_referenced_columns() -> None:
    sql = """
    CREATE DATABASE IF NOT EXISTS ANALYTICS;
    CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;
    CREATE TABLE ANALYTICS.CORE.CUSTOMER (
        CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID) NOT ENFORCED
    );
    CREATE TABLE ANALYTICS.CORE.ORDER_HEADER (
        ORDER_ID NUMBER(38, 0) NOT NULL,
        CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        BILLING_CUSTOMER_ID NUMBER(38, 0) NOT NULL,
        CONSTRAINT PK_ORDER_HEADER PRIMARY KEY (ORDER_ID) NOT ENFORCED
    );
    ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER
        FOREIGN KEY (CUSTOMER_ID, BILLING_CUSTOMER_ID)
        REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID, CUSTOMER_ID) NOT ENFORCED;
    """
    with pytest.raises(
        SnowflakeDDLImportError,
        match="referenced_columns must be unique|FK_ORDER_HEADER_CUSTOMER",
    ):
        import_snowflake_ddl(sql, model_name="dup-fk-ref")


def _create_table_bodies(sql: str) -> str:
    bodies: list[str] = []
    for statement in sql.split(";"):
        stripped = statement.strip()
        upper = stripped.upper()
        if upper.startswith("CREATE TABLE"):
            bodies.append(stripped)
    return "\n".join(bodies)
